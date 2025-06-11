@@ .. @@
               <div className="flex items-center space-x-4">
                 {!isOnline && (
                   <div className="px-3 py-1 bg-red-500/20 text-red-400 rounded-md text-sm flex items-center">
                     <span className="mr-1">●</span>
                     Offline Mode
                   </div>
                 )}
-                <ConnectionStatus showAlways={true} />
+                <ConnectionStatus />
                 <button 
                   onClick={navigateToFrontend}
                   className="neon-button"
@@ .. @@