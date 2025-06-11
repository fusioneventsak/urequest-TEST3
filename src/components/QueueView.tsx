// src/components/QueueView.tsx
export function QueueView({ requests, onLockRequest, onMarkPlayed, onResetQueue }: QueueViewProps) {
  const [lockingStates, setLockingStates] = useState<Set<string>>(new Set());
  const [expandedRequests, setExpandedRequests] = useState<Set<string>>(new Set());
  const [isResetting, setIsResetting] = useState(false);
  const [isConfirmingReset, setIsConfirmingReset] = useState(false);
  const [optimisticLocks, setOptimisticLocks] = useState<Set<string>>(new Set());
  const [optimisticallyClearedQueue, setOptimisticallyClearedQueue] = useState(false);
  const [resetStartTime, setResetStartTime] = useState<number | null>(null);
  
  // Track if component is mounted
  const mountedRef = useRef(true);

  // Handle queue reset with confirmation
  const handleResetQueue = async () => {
    if (!onResetQueue) return;
    setIsConfirmingReset(false);
    
    setResetStartTime(Date.now());
    
    // OPTIMISTIC UPDATE: Immediately hide all requests in UI
    setOptimisticallyClearedQueue(true);
    
    setIsResetting(true);
    try {
      console.log('🚀 Starting ultra-fast queue reset...');
      
      await onResetQueue();
      
      const resetTime = resetStartTime ? Date.now() - resetStartTime : 0;
      console.log(`⚡ Queue reset completed in ${resetTime}ms`);
      
      // Success toast will be handled by the parent component
      // Keep optimistic state until real data arrives
      
    } catch (error) {
      console.error('Error clearing queue:', error);
      
      // REVERT optimistic update on error
      setOptimisticallyClearedQueue(false);
      
      toast.error('Failed to clear queue. Please try again.');
    } finally {
      setIsResetting(false);
      setResetStartTime(null);
    }
  };

  // Clear optimistic state when real data shows the queue is actually cleared
  useEffect(() => {
    const pendingRequests = requests.filter(r => !r.isPlayed);
    
    if (optimisticallyClearedQueue && pendingRequests.length === 0) {
      console.log('✅ Real data confirms queue is cleared, removing optimistic state');
      setOptimisticallyClearedQueue(false);
    }
  }, [requests, optimisticallyClearedQueue]);

  // Apply optimistic filtering
  const displayRequests = useMemo(() => {
    if (optimisticallyClearedQueue) {
      // Show empty queue optimistically
      return [];
    }
    return sortedRequests;
  }, [sortedRequests, optimisticallyClearedQueue]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold neon-text">Request Queue</h2>
        <div className="flex items-center space-x-4">
          <div className="text-sm text-gray-400">
            {displayRequests.length} pending
          </div>
          {onResetQueue && !isConfirmingReset && (
            <button
              onClick={showResetConfirmation}
              disabled={isResetting || displayRequests.length === 0}
              className={`px-4 py-2 text-sm text-red-400 hover:bg-red-400/20 rounded-md transition-colors ${
                isResetting || displayRequests.length === 0 ? 'opacity-50 cursor-not-allowed' : ''
              }`}
            >
              {isResetting ? 'Clearing...' : 'Clear Queue'}
            </button>
          )}
        </div>
      </div>

      <div className="grid gap-1">
        {optimisticallyClearedQueue ? (
          // Show clearing state
          <div className="glass-effect rounded-lg p-8 text-center">
            <div className="flex items-center justify-center space-x-2 text-green-400">
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-green-400"></div>
              <span className="text-lg font-medium">Clearing queue...</span>
            </div>
            <p className="text-gray-400 mt-2">
              This should complete in just a few milliseconds
            </p>
          </div>
        ) : displayRequests.length === 0 ? (
          // Show empty state
          <div className="glass-effect rounded-lg p-8 text-center">
            <p className="text-gray-400 text-lg">No pending requests</p>
            <p className="text-gray-500 text-sm mt-1">
              New song requests will appear here
            </p>
          </div>
        ) : (
          displayRequests.map((request) => {