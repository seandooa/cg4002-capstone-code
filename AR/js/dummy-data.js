class DummyDataProvider {
  constructor() {
    this.isActive = false
    this.startTime = null
    this.repCount = 0
    this.lastRepTime = 0
    this.heartRateBase = 70
    this.pulseBase = 70
    this.exerciseType = "Hr Only"

    // Callbacks for data updates (from relay server only)
    this.onMetricsUpdate = null
    this.onRepDetected = null
    this.onExerciseStateChange = null

    // Relay node communication
    this.relayNodeConfig = {
      enabled: true,
      url: '',  // Will be auto-configured based on detected IP
      reconnectInterval: 5000,
      maxReconnectAttempts: 10
    }
    this.relayConnection = null
    this.isConnectedToRelay = false
    this.reconnectAttempts = 0
    this.deviceId = this.generateDeviceId()
    
    // Local metrics simulation
    this.metricsInterval = null
    
    // Connection monitoring
    this.connectionMonitorInterval = null
    this.lastMessageTime = null
    this.messageCount = 0
    
    // Track message types received for debugging
    this.messageTypesReceived = {}
  }

  setExerciseType(exerciseType) {
    this.exerciseType = exerciseType
    console.log(`Relay data provider exercise set to: ${exerciseType}`)
  }

  startWorkout() {
    if (this.isActive) return

    this.isActive = true
    this.startTime = Date.now()
    this.repCount = 0
    this.lastRepTime = 0

    console.log('='.repeat(50))
    console.log('[Workout Start] Starting workout for:', this.exerciseType)
    console.log('[Workout Start] Relay connection status:', this.isConnectedToRelay)
    console.log('[Workout Start] Relay connection state:', this.relayConnection ? this.relayConnection.readyState : 'null')
    console.log('[Workout Start] Relay URL:', this.relayNodeConfig.url)
    console.log('='.repeat(50))

    // Connect to relay server if not already connected
    if (!this.isConnectedToRelay) {
      console.log('[Workout Start] Not connected, attempting connection...')
      this.connectToRelayNode()
    } else {
      console.log('[Workout Start] Already connected, sending workout start notification...')
      // Send workout start notification to existing connection
      this.sendToRelay({
        type: 'workout_started',
        deviceId: this.deviceId,
        exerciseType: this.exerciseType,
        timestamp: Date.now()
      })
    }

    // Start local metrics simulation as fallback (only if not connected to server)
    // If connected to server, server will provide all metrics
    if (!this.isConnectedToRelay) {
      this.startLocalMetricsSimulation()
    } else {
      console.log('[Workout Start] Server is connected - using server metrics only')
    }

    if (this.onExerciseStateChange) {
      this.onExerciseStateChange("started")
    }
  }

  stopWorkout() {
    if (!this.isActive) return

    this.isActive = false
    console.log("Workout stopped - maintaining connection to relay server")

    // Stop local metrics simulation
    this.stopLocalMetricsSimulation()

    // Send workout stop notification to server but keep connection alive
    if (this.isConnectedToRelay) {
      this.sendToRelay({
        type: 'workout_stopped',
        deviceId: this.deviceId,
        exerciseType: this.exerciseType,
        timestamp: Date.now()
      })
    }

    if (this.onExerciseStateChange) {
      this.onExerciseStateChange("stopped")
    }
  }

  // Local metrics simulation as fallback when server is unavailable
  startLocalMetricsSimulation() {
    if (this.metricsInterval) {
      clearInterval(this.metricsInterval)
    }

    // Don't run local simulation if we're connected to the server
    // Server will provide all metrics including rep count
    if (this.isConnectedToRelay) {
      console.log('[Local Metrics] Skipping local simulation - server is providing metrics')
      return
    }

    console.log('[Local Metrics] Starting local metrics simulation (server not connected)')
    
    this.metricsInterval = setInterval(() => {
      if (!this.isActive) return
      
      // If we became connected to server, stop local simulation
      if (this.isConnectedToRelay) {
        console.log('[Local Metrics] Server connected - stopping local simulation')
        this.stopLocalMetricsSimulation()
        return
      }

      const now = Date.now()
      const workoutDuration = Math.floor((now - this.startTime) / 1000)

      // Generate realistic metrics based on exercise type and duration
      const metrics = this.generateLocalMetrics(workoutDuration)

      // Update local metrics display
      if (this.onMetricsUpdate) {
        this.onMetricsUpdate(metrics)
      }

      // Send to relay if connected (but we already checked it's not)
      if (this.isConnectedToRelay) {
        this.sendMetricsToRelay(metrics)
      }
    }, 1000) // Update every second
  }

  stopLocalMetricsSimulation() {
    if (this.metricsInterval) {
      clearInterval(this.metricsInterval)
      this.metricsInterval = null
    }
  }

  generateLocalMetrics(workoutDuration) {
    // Base metrics that increase over time
    const baseHeartRate = 70
    const basePulse = 70
    
    // Simulate increasing heart rate during workout
    const intensityFactor = Math.min(workoutDuration / 300, 1) // Max intensity after 5 minutes
    const heartRateVariation = Math.sin(workoutDuration / 10) * 10 // Natural variation
    const heartRate = Math.round(baseHeartRate + (intensityFactor * 30) + heartRateVariation)
    const pulse = Math.round(basePulse + (intensityFactor * 25) + heartRateVariation)

    // Rep count is provided by server only - no local simulation
    // Use the rep count that was last updated by the server
    const repCount = this.repCount

    // Calculate calories (simple formula)
    const calories = Math.round(workoutDuration * 0.1 + repCount * 0.5)

    return {
      heartRate: Math.max(60, Math.min(200, heartRate)), // Clamp between 60-200
      pulse: Math.max(60, Math.min(200, pulse)),
      repCount: repCount,
      workoutDuration: workoutDuration,
      caloriesBurned: calories
    }
  }


  // Relay node communication methods
  generateDeviceId() {
    return 'device_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now()
  }

  configureRelayNode(config) {
    this.relayNodeConfig = { ...this.relayNodeConfig, ...config }
    console.log('Relay node configuration updated:', this.relayNodeConfig)
  }

  async connectToRelayNode() {
    if (!this.relayNodeConfig.enabled) {
      console.log('Relay node communication disabled')
      return false
    }

    // Don't create multiple connections
    if (this.relayConnection && this.relayConnection.readyState === WebSocket.CONNECTING) {
      console.log('Connection already in progress')
      return false
    }

    if (this.relayConnection && this.relayConnection.readyState === WebSocket.OPEN) {
      console.log('Already connected to relay node')
      return true
    }

    try {
      console.log(`Connecting to relay node at ${this.relayNodeConfig.url}`)
      this.relayConnection = new WebSocket(this.relayNodeConfig.url)

      this.relayConnection.onopen = () => {
        console.log('='.repeat(50))
        console.log('[WebSocket] ✅ Connected to relay node')
        console.log('[WebSocket] Connection state:', this.relayConnection.readyState, '(OPEN = 1)')
        console.log('[WebSocket] URL:', this.relayNodeConfig.url)
        console.log('[WebSocket] Device ID:', this.deviceId)
        console.log('='.repeat(50))
        this.isConnectedToRelay = true
        this.reconnectAttempts = 0
        
        // Stop local metrics simulation - server will provide all metrics
        if (this.metricsInterval) {
          console.log('[WebSocket] Stopping local metrics simulation - server will provide metrics')
          this.stopLocalMetricsSimulation()
        }
        
        // Send device registration
        this.sendToRelay({
          type: 'device_register',
          deviceId: this.deviceId,
          exerciseType: this.exerciseType,
          timestamp: Date.now()
        })
        
        // Start connection health monitoring
        this.startConnectionMonitoring()
      }

      this.relayConnection.onmessage = (event) => {
        try {
          this.messageCount++
          this.lastMessageTime = Date.now()
          
          const data = JSON.parse(event.data)
          const messageType = data.type || 'unknown'
          
          // Log message type prominently for AI feedback
          if (messageType === 'ai_feedback') {
            console.log('[WebSocket] ✅ Message #' + this.messageCount + ' received at', new Date().toLocaleTimeString())
            console.log('[WebSocket] 🎯 AI FEEDBACK MESSAGE DETECTED!')
            console.log('[WebSocket] Raw message received:', event.data)
            console.log('[WebSocket] Parsed data:', data)
          } else {
            console.log('[WebSocket] ✅ Message #' + this.messageCount + ' received at', new Date().toLocaleTimeString())
            console.log('[WebSocket] Raw message received:', event.data)
            console.log('[WebSocket] Parsed data:', data)
          }
          
          this.handleRelayMessage(data)
        } catch (error) {
          console.error('❌ Failed to parse relay message:', error, 'Raw data:', event.data)
        }
      }

      this.relayConnection.onclose = (event) => {
        console.log('Disconnected from relay node', event.code, event.reason)
        this.isConnectedToRelay = false
        
        // Only attempt reconnect if it wasn't a clean close (code 1000) or if we're in an active workout
        if (event.code !== 1000 || this.isActive) {
          this.attemptReconnect()
        } else {
          console.log('Clean disconnect - not attempting reconnect')
        }
      }

      this.relayConnection.onerror = (error) => {
        console.error('Relay connection error:', error)
        this.isConnectedToRelay = false
      }

      return true
    } catch (error) {
      console.error('Failed to connect to relay node:', error)
      this.attemptReconnect()
      return false
    }
  }

  handleRelayMessage(data) {
    const messageType = data.type

    // Track message types for debugging
    if (!this.messageTypesReceived[messageType]) {
      this.messageTypesReceived[messageType] = 0
    }
    this.messageTypesReceived[messageType]++
    
    // Log summary of message types every 20 messages
    if (this.messageCount % 20 === 0 && this.messageCount > 0) {
      console.log('[Message Stats] Types received:', this.messageTypesReceived)
      if (!this.messageTypesReceived['ai_feedback']) {
        console.log('⚠️  WARNING: No ai_feedback messages received yet!')
      }
    }

    // Log all incoming messages for debugging
    if (messageType === 'ai_feedback') {
      console.log('[Relay Message] 🎯 AI FEEDBACK MESSAGE! Type:', messageType, 'Payload:', data.payload || data)
    } else {
      console.log('[Relay Message] Received message type:', messageType, 'Payload:', data.payload || data)
    }

    switch (messageType) {
      case 'ai_feedback':
        console.log('[Relay Message] 🎯 Routing to handleAIFeedback...')
        this.handleAIFeedback(data.payload)
        break
      case 'system_command':
        this.handleSystemCommand(data.payload)
        break
      case 'performance_metrics':
        console.log('[Performance Metrics] Processing performance metrics message...')
        this.handlePerformanceMetrics(data.payload)
        break
      case 'biometric_data':
        this.handleBiometricData(data.payload)
        break
      default:
        console.log('⚠️  Unknown relay message type:', messageType)
        console.log('⚠️  Full message data:', JSON.stringify(data, null, 2))
        // Check if it might be AI feedback in a different format
        if (data.feedback !== undefined || data.status !== undefined) {
          console.log('⚠️  Message contains feedback/status - might be AI feedback in wrong format')
          console.log('⚠️  Attempting to handle as AI feedback...')
          this.handleAIFeedback(data.payload || data)
        }
    }
  }

  handleAIFeedback(payload) {
    // Always log AI feedback with clear formatting (similar to performance metrics)
    console.log('='.repeat(50))
    console.log('[AI Feedback] RECEIVED FROM SERVER:')
    console.log('  Feedback Value:', payload.feedback, '(0 = Bad Form, 1 = Good Form)')
    console.log('  Timestamp:', new Date(payload.timestamp || Date.now()).toLocaleTimeString())
    console.log('Full payload:', payload)
    console.log('='.repeat(50))
    
    // Directly update feedback UI
    const feedbackStatus = document.getElementById("feedback-status")
    const suggestionsList = document.getElementById("suggestions-list")
    
    if (!feedbackStatus) {
      console.error('[AI Feedback] Feedback status element not found!')
      return
    }
    
    if (payload.feedback === "Error") {
      // Don't update if valid_check=0 (Error)
      console.log('[AI Feedback] Received Error - keeping previous feedback')
      return
    }
    
    let statusClass, statusText
    if (payload.feedback === "Good Form") {
      statusClass = "feedback-good"
      statusText = "Good Form"
    } else if (payload.feedback === "Bad Form") {
      statusClass = "feedback-error"
      statusText = "Bad Form"
    } else {
      // Unknown feedback - skip update
      console.warn('[AI Feedback] Unknown feedback message:', payload.feedback)
      return
    }
    
    // Update status
    feedbackStatus.className = statusClass
    feedbackStatus.textContent = statusText
    
    // Clear suggestions
    if (suggestionsList) {
      suggestionsList.innerHTML = ''
    }
    
    // Update AR renderer with feedback (for highlighted joints if needed)
    if (window.arRenderer) {
      window.arRenderer.updateFeedbackVisuals(payload)
    }
  }

  handlePerformanceMetrics(payload) {
    // Always log performance metrics with clear formatting
    console.log('='.repeat(50))
    console.log('[Performance Metrics] RECEIVED FROM SERVER:')
    console.log('  Heart Rate:', payload.heartRate, 'bpm')
    console.log('  Pulse:', payload.pulse, 'bpm')
    console.log('  Rep Count:', payload.repCount, '(UPDATING FROM SERVER)')
    console.log('  Workout Duration:', payload.workoutDuration, 'seconds')
    console.log('  Calories Burned:', payload.caloriesBurned)
    console.log('  Timestamp:', new Date(payload.timestamp || Date.now()).toLocaleTimeString())
    console.log('Full payload:', payload)
    console.log('='.repeat(50))
    
    // IMPORTANT: Rep count is ONLY updated from server - no local simulation
    // Update local rep count from server data and trigger callback only when it increases
    if (payload.repCount !== undefined && payload.repCount !== null) {
      const previousRepCount = this.repCount
      this.repCount = payload.repCount
      
      // Trigger rep detection callback ONLY when rep count increases from server
      if (payload.repCount > previousRepCount && this.onRepDetected) {
        console.log(`[Performance Metrics] Rep count increased from server: ${previousRepCount} → ${payload.repCount}`)
        this.onRepDetected(payload.repCount)
      }
    }
    
    // Update metrics display with server data
    if (this.onMetricsUpdate) {
      this.onMetricsUpdate(payload)
    }
    
    // Notify app to update metrics display (this will update the UI)
    if (window.app) {
      window.app.updateMetricsFromServer(payload)
    }
  }

  handleSystemCommand(payload) {
    console.log('Received system command:', payload)
    
    switch (payload.action) {
      case 'select_exercise':
        this.handleSelectExerciseCommand(payload)
        break
      case 'start_workout':
        this.handleStartWorkoutCommand(payload)
        break
      case 'stop_workout':
        this.handleStopWorkoutCommand(payload)
        break
      case 'pause_workout':
        this.handlePauseWorkoutCommand(payload)
        break
      default:
        console.log('Unknown system command:', payload.action)
    }
  }

  handleSelectExerciseCommand(payload) {
    let exerciseType = payload.exerciseType || payload.exercise_type
    
    // Validate exercise type - use "Hr Only" if empty or invalid
    const validExercises = ['Hr Only', 'lateral-raises', 'squats', 'bicep-curls']
    
    if (!exerciseType || exerciseType.trim() === '' || !validExercises.includes(exerciseType)) {
      console.warn(`Invalid or empty exercise type: "${exerciseType}". Defaulting to "Hr Only"`)
      exerciseType = 'Hr Only'
    }

    console.log(`Server command: Select exercise - ${exerciseType}`)

    // Update exercise type
    this.setExerciseType(exerciseType)
    
    // Notify app to update exercise display
    if (window.app) {
      window.app.handleServerExerciseSelection(exerciseType)
    }
  }

  handleStartWorkoutCommand(payload) {
    console.log('Server command: Start workout')
    
    // Notify app to start workout
    if (window.app) {
      window.app.handleServerStartWorkout()
    }
  }

  handleStopWorkoutCommand(payload) {
    console.log('Server command: Stop workout')
    
    // Notify app to stop workout
    if (window.app) {
      window.app.handleServerStopWorkout()
    }
  }

  handlePauseWorkoutCommand(payload) {
    console.log('Server command: Pause workout')
    
    // Notify app to pause workout
    if (window.app) {
      window.app.handleServerPauseWorkout()
    }
  }

  handleBiometricData(payload) {
    console.log('Received biometric data from relay:', payload)
    
    // Update metrics display with relay data
    if (this.onMetricsUpdate) {
      this.onMetricsUpdate(payload)
    }
  }

  sendToRelay(data) {
    if (this.relayConnection && this.relayConnection.readyState === WebSocket.OPEN) {
      try {
        this.relayConnection.send(JSON.stringify(data))
        console.log('Sent to relay:', data.type)
      } catch (error) {
        console.error('Failed to send data to relay:', error)
      }
    } else {
      console.warn('Relay connection not available')
    }
  }

  sendMetricsToRelay(metrics) {
    this.sendToRelay({
      type: 'biometric_data',
      deviceId: this.deviceId,
      data: {
        heartRate: metrics.heartRate,
        pulse: metrics.pulse,
        repCount: metrics.repCount,
        exerciseType: this.exerciseType,
        workoutDuration: metrics.workoutDuration,
        timestamp: Date.now()
      }
    })
  }

  sendPoseDataToRelay(poseData) {
    this.sendToRelay({
      type: 'pose_data',
      deviceId: this.deviceId,
      data: {
        keypoints: poseData.keypoints || [],
        exerciseType: this.exerciseType,
        timestamp: Date.now()
      }
    })
  }

  sendRepDetectionToRelay(repCount) {
    this.sendToRelay({
      type: 'rep_detection',
      deviceId: this.deviceId,
      data: {
        repCount: repCount,
        exerciseType: this.exerciseType,
        timestamp: Date.now()
      }
    })
  }

  attemptReconnect() {
    // Don't reconnect if we're not in an active workout or if we've reached max attempts
    if (this.reconnectAttempts >= this.relayNodeConfig.maxReconnectAttempts) {
      console.log('Max reconnection attempts reached')
      return
    }

    // Only attempt to reconnect if we're in an active workout or if the connection was lost unexpectedly
    if (!this.isActive && this.reconnectAttempts === 0) {
      console.log('Not attempting reconnect - no active workout and no previous connection issues')
      return
    }

    this.reconnectAttempts++
    console.log(`Attempting to reconnect to relay node (${this.reconnectAttempts}/${this.relayNodeConfig.maxReconnectAttempts})`)

    setTimeout(() => {
      this.connectToRelayNode()
    }, this.relayNodeConfig.reconnectInterval)
  }

  // Method to properly disconnect when app is being disposed
  disconnect() {
    console.log("Disconnecting from relay server")
    
    // Stop local metrics simulation
    this.stopLocalMetricsSimulation()
    
    // Stop connection monitoring
    this.stopConnectionMonitoring()
    
    // Close connection
    if (this.relayConnection) {
      this.relayConnection.close()
      this.relayConnection = null
      this.isConnectedToRelay = false
    }
    
    // Reset reconnect attempts
    this.reconnectAttempts = 0
    
    // Reset message tracking
    this.messageCount = 0
    this.lastMessageTime = null
  }

  // Method to manually trigger rep detection (for testing)
  triggerRepDetection() {
    if (!this.isActive) return

    this.repCount++
    this.lastRepTime = Date.now()

    console.log(`${this.exerciseType} rep detected: ${this.repCount}`)

    if (this.onRepDetected) {
      this.onRepDetected(this.repCount)
    }

    // Send rep detection to relay node
    this.sendRepDetectionToRelay(this.repCount)
  }

  // Method to manually update metrics (for testing)
  updateMetrics(metrics) {
    if (this.onMetricsUpdate) {
      this.onMetricsUpdate(metrics)
    }

    // Send metrics to relay node
    this.sendMetricsToRelay(metrics)
  }

  // Start connection monitoring to track message reception
  startConnectionMonitoring() {
    if (this.connectionMonitorInterval) {
      clearInterval(this.connectionMonitorInterval)
    }
    
    this.connectionMonitorInterval = setInterval(() => {
      const state = this.relayConnection ? this.relayConnection.readyState : -1
      const states = {
        0: 'CONNECTING',
        1: 'OPEN',
        2: 'CLOSING',
        3: 'CLOSED',
        '-1': 'NULL'
      }
      
      const timeSinceLastMessage = this.lastMessageTime 
        ? Math.floor((Date.now() - this.lastMessageTime) / 1000) 
        : 'never'
      
      console.log('[Connection Monitor] State:', states[state], '| Messages received:', this.messageCount, '| Last message:', timeSinceLastMessage, 'seconds ago')
      
      // Warn if connection is closed but we think we're connected
      if (state !== 1 && this.isConnectedToRelay) {
        console.warn('[Connection Monitor] ⚠️  Connection state mismatch! State:', states[state], 'but isConnectedToRelay is true')
      }
      
      // Warn if no messages received for a while
      if (this.isActive && this.lastMessageTime && (Date.now() - this.lastMessageTime) > 15000) {
        console.warn('[Connection Monitor] ⚠️  No messages received for', timeSinceLastMessage, 'seconds during active workout!')
      }
    }, 10000) // Check every 10 seconds
  }

  // Stop connection monitoring
  stopConnectionMonitoring() {
    if (this.connectionMonitorInterval) {
      clearInterval(this.connectionMonitorInterval)
      this.connectionMonitorInterval = null
    }
  }
}

// Make globally available
window.DummyDataProvider = DummyDataProvider

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
  module.exports = DummyDataProvider
}