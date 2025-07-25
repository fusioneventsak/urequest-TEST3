// src/utils/enhancedRealtimeManager.ts
import { supabase } from './supabase';
import { nanoid } from 'nanoid';

interface ChannelConfig {
  channel: any;
  table: string;
  callback: (payload: any) => void;
  priority: 'high' | 'normal' | 'low';
  lastUpdate: number;
}

interface SubscriptionFilter {
  event?: string;
  schema?: string;
  table?: string;
  filter?: string;
}

class EnhancedRealtimeManager {
  private static instance: EnhancedRealtimeManager;
  private activeChannels = new Map<string, ChannelConfig>();
  private connectionStatus: 'connecting' | 'connected' | 'disconnected' = 'disconnected';
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  private clientId = nanoid(8);
  private channelRetries = new Map<string, number>();
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private connectionListeners = new Set<(status: string) => void>();
  private isInitialized = false;
  
  // High-priority tables that need faster updates
  private highPriorityTables = new Set(['requests', 'requesters']);
  
  // Debounce timeouts for different priorities
  private updateTimeouts = new Map<string, NodeJS.Timeout>();
  private priorityDebounceDelays = {
    high: 100,     // 100ms for critical updates (queue locks)
    normal: 250,   // 250ms for normal updates
    low: 500       // 500ms for low priority updates
  };

  static getInstance(): EnhancedRealtimeManager {
    if (!EnhancedRealtimeManager.instance) {
      EnhancedRealtimeManager.instance = new EnhancedRealtimeManager();
    }
    return EnhancedRealtimeManager.instance;
  }

  async init(): Promise<void> {
    if (this.isInitialized) return;
    
    console.log('🚀 Initializing Enhanced Realtime Manager');
    
    try {
      this.connectionStatus = 'connecting';
      this.isInitialized = true;
      
      // Start heartbeat for connection health
      this.startHeartbeat();
      
      // Setup automatic reconnection on network changes
      if (typeof window !== 'undefined') {
        window.addEventListener('online', this.handleNetworkOnline.bind(this));
        window.addEventListener('offline', this.handleNetworkOffline.bind(this));
      }
      
      this.connectionStatus = 'connected';
      this.notifyConnectionListeners('connected');
      
      console.log('✅ Enhanced Realtime Manager initialized');
    } catch (error) {
      console.error('❌ Failed to initialize Enhanced Realtime Manager:', error);
      this.connectionStatus = 'disconnected';
      this.notifyConnectionListeners('disconnected');
      throw error;
    }
  }

  private setupConnectionMonitoring(): void {
    // Connection monitoring is handled through individual channel subscriptions
    // and the heartbeat mechanism rather than global realtime events
  }

  private startHeartbeat(): void {
    // Send periodic heartbeat to maintain connection
    this.heartbeatInterval = setInterval(async () => {
      try {
        // Ping the database to check connection
        const { error } = await supabase.from('requests').select('id').limit(1);
        if (error) {
          console.warn('❤️ Heartbeat failed:', error);
          this.handleConnectionFailure();
        }
      } catch (error) {
        console.warn('❤️ Heartbeat error:', error);
        this.handleConnectionFailure();
      }
    }, 30000); // 30-second heartbeat
  }

  private handleConnectionFailure(): void {
    if (this.connectionStatus === 'connected') {
      this.connectionStatus = 'disconnected';
      this.notifyConnectionListeners('disconnected');
      this.attemptReconnection();
    }
  }

  private async attemptReconnection(): Promise<void> {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('❌ Max reconnection attempts reached');
      this.notifyConnectionListeners('error');
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
    
    console.log(`🔄 Attempting reconnection ${this.reconnectAttempts}/${this.maxReconnectAttempts} in ${delay}ms`);
    this.notifyConnectionListeners('connecting');
    
    setTimeout(async () => {
      try {
        await this.reconnectAllChannels();
        this.connectionStatus = 'connected';
        this.reconnectAttempts = 0;
        this.notifyConnectionListeners('connected');
      } catch (error) {
        console.error('❌ Reconnection failed:', error);
        this.notifyConnectionListeners('error');
        this.attemptReconnection();
      }
    }, delay);
  }

  private async reconnectAllChannels(): Promise<void> {
    console.log('🔄 Reconnecting all channels');
    
    const channelsToReconnect = Array.from(this.activeChannels.entries());
    
    // Clear existing channels
    this.activeChannels.clear();
    
    // Recreate all channels
    for (const [channelId, config] of channelsToReconnect) {
      try {
        await this.createSubscription(
          config.table,
          config.callback,
          undefined,
          config.priority
        );
        console.log(`✅ Reconnected channel for ${config.table}`);
      } catch (error) {
        console.error(`❌ Failed to reconnect channel for ${config.table}:`, error);
      }
    }
  }

  private handleNetworkOnline(): void {
    console.log('🌐 Network back online - reconnecting');
    this.notifyConnectionListeners('connecting');
    this.attemptReconnection();
  }

  private handleNetworkOffline(): void {
    console.log('🌐 Network offline');
    this.connectionStatus = 'disconnected';
    this.notifyConnectionListeners('disconnected');
  }

  createSubscription(
    table: string,
    callback: (payload: any) => void,
    filter?: SubscriptionFilter,
    priority?: 'high' | 'normal' | 'low'
  ): string {
    const channelId = `${table}_${nanoid(6)}`;
    
    // Determine priority based on table importance
    const determinedPriority = priority || (this.highPriorityTables.has(table) ? 'high' : 'normal');
    
    try {
      // Create optimized channel configuration
      const channelConfig = {
        config: {
          presence: { key: this.clientId },
          broadcast: { self: false },
          // Adjust event frequency based on priority
          params: { 
            eventsPerSecond: determinedPriority === 'high' ? 20 : 10
          }
        }
      };

      const channel = supabase.channel(channelId, channelConfig);
      
      // Setup postgres changes listener with priority-based debouncing
      channel.on(
        'postgres_changes',
        filter || { event: '*', schema: 'public', table },
        (payload) => {
          try {
            console.log(`🔔 ${table} table changed (${determinedPriority}):`, payload.eventType, payload.new);
            
            // Clear existing timeout for this channel
            if (this.updateTimeouts.has(channelId)) {
              clearTimeout(this.updateTimeouts.get(channelId)!);
            }
            
            // Set new timeout with priority-based delay
            const delay = this.priorityDebounceDelays[determinedPriority];
            this.updateTimeouts.set(channelId, setTimeout(() => {
              callback(payload);
              this.updateTimeouts.delete(channelId);
            }, delay));
            
          } catch (error) {
            console.error(`❌ Error in subscription callback (${channelId}):`, error);
          }
        }
      );

      // Subscribe with error handling
      channel.subscribe((status) => {
        console.log(`📡 Channel ${channelId} (${table}) status:`, status);
        
        if (status === 'SUBSCRIBED') {
          console.log(`✅ Successfully subscribed to ${table} with ${determinedPriority} priority`);
          this.connectionStatus = 'connected';
          this.notifyConnectionListeners('connected');
        } else if (status === 'CHANNEL_ERROR') {
          console.warn(`⚠️ Channel error for ${table} - attempting recovery`);
          this.notifyConnectionListeners('error');
          
          // Track retry attempts for this channel
          const retryCount = this.channelRetries.get(channelId) || 0;
          if (retryCount < 3) {
            this.channelRetries.set(channelId, retryCount + 1);
            // Exponential backoff: 2s, 4s, 8s
            const delay = 2000 * Math.pow(2, retryCount);
            console.log(`🔄 Retrying ${table} subscription in ${delay}ms (attempt ${retryCount + 1}/3)`);
            
            setTimeout(() => {
              this.createSubscription(table, callback, filter, priority);
            }, delay);
          } else {
            console.error(`❌ Max retries reached for ${table} channel`);
          }
        }
      });
      
      // Store channel configuration
      this.activeChannels.set(channelId, {
        channel,
        table,
        callback,
        priority: determinedPriority,
        lastUpdate: Date.now()
      });
      
      console.log(`📡 Created ${determinedPriority} priority subscription for ${table}`);
      return channelId;
      
    } catch (error) {
      console.error(`❌ Error creating subscription to ${table}:`, error);
      this.notifyConnectionListeners('error');
      throw error;
    }
  }

  async removeSubscription(channelId: string): Promise<void> {
    try {
      const config = this.activeChannels.get(channelId);
      if (config) {
        await config.channel.unsubscribe();
        this.channelRetries.delete(channelId);
        this.activeChannels.delete(channelId);
        
        // Clear any pending timeouts
        if (this.updateTimeouts.has(channelId)) {
          clearTimeout(this.updateTimeouts.get(channelId)!);
          this.updateTimeouts.delete(channelId);
        }
        
        console.log(`🗑️ Removed subscription: ${channelId}`);
      }
    } catch (error) {
      console.error(`❌ Error removing subscription ${channelId}:`, error);
    }
  }

  addConnectionListener(listener: (status: string) => void): void {
    this.connectionListeners.add(listener);
    // Immediately notify with current status
    try {
      listener(this.connectionStatus);
    } catch (error) {
      console.error('❌ Error in connection listener:', error);
    }
  }

  removeConnectionListener(listener: (status: string) => void): void {
    this.connectionListeners.delete(listener);
  }

  private notifyConnectionListeners(status: string): void {
    this.connectionListeners.forEach(listener => {
      try {
        listener(status);
      } catch (error) {
        console.error('❌ Error in connection listener:', error);
      }
    });
  }

  getConnectionStatus(): string {
    return this.connectionStatus;
  }

  isConnected(): boolean {
    return this.connectionStatus === 'connected';
  }

  async reconnect(): Promise<void> {
    console.log('🔄 Manual reconnection requested');
    this.connectionStatus = 'connecting';
    this.notifyConnectionListeners('connecting');
    
    try {
      // First try to ping the database
      const { error } = await supabase.from('requests').select('id').limit(1);
      if (error) {
        console.warn('Database ping failed during reconnect:', error);
      }
      
      await this.reconnectAllChannels();
      this.connectionStatus = 'connected';
      this.reconnectAttempts = 0;
      this.notifyConnectionListeners('connected');
      console.log('✅ Manual reconnection successful');
    } catch (error) {
      console.error('❌ Manual reconnection failed:', error);
      this.connectionStatus = 'disconnected';
      this.notifyConnectionListeners('disconnected');
      throw error;
    }
  }

  destroy(): void {
    console.log('🗑️ Destroying Enhanced Realtime Manager');
    
    // Clear heartbeat
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    
    // Clear all timeouts
    this.updateTimeouts.forEach(timeout => clearTimeout(timeout));
    this.updateTimeouts.clear();
    this.channelRetries.clear();
    
    // Remove all subscriptions
    this.activeChannels.forEach(async (config, channelId) => {
      await this.removeSubscription(channelId);
    });
    
    // Remove event listeners
    if (typeof window !== 'undefined') {
      window.removeEventListener('online', this.handleNetworkOnline.bind(this));
      window.removeEventListener('offline', this.handleNetworkOffline.bind(this));
    }
    
    this.connectionListeners.clear();
    this.isInitialized = false;
  }
}

// Export singleton instance
export const enhancedRealtimeManager = EnhancedRealtimeManager.getInstance();