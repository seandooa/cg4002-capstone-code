class DummyDataProvider {
  constructor() {
    this.isActive = false
    this.startTime = null
    this.repCount = 0
    this.lastRepTime = 0
    this.heartRateBase = 70
    this.pulseBase = 70
    this.exerciseType = "push-ups"

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

    console.log(`Workout started - connecting to relay server for ${this.exerciseType}`)

    // Connect to relay server if not already connected
    if (!this.isConnectedToRelay) {
      this.connectToRelayNode()
    } else {
      // Send workout start notification to existing connection
      this.sendToRelay({
        type: 'workout_started',
        deviceId: this.deviceId,
        exerciseType: this.exerciseType,
        timestamp: Date.now()
      })
    }

    // Start local metrics simulation as fallback
    this.startLocalMetricsSimulation()

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

    this.metricsInterval = setInterval(() => {
      if (!this.isActive) return

      const now = Date.now()
      const workoutDuration = Math.floor((now - this.startTime) / 1000)

      // Generate realistic metrics based on exercise type and duration
      const metrics = this.generateLocalMetrics(workoutDuration)

      // Update local metrics display
      if (this.onMetricsUpdate) {
        this.onMetricsUpdate(metrics)
      }

      // Send to relay if connected
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

    // Simulate rep counting based on exercise type and time
    let repCount = this.repCount
    if (workoutDuration > 0 && workoutDuration % 3 === 0) { // Every 3 seconds
      const repProbability = this.getRepProbability()
      if (Math.random() < repProbability) {
        repCount++
        this.repCount = repCount
        
        // Trigger rep detection callback
        if (this.onRepDetected) {
          this.onRepDetected(repCount)
        }
      }
    }

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

  getRepProbability() {
    // Different rep probabilities based on exercise type
    switch (this.exerciseType) {
      case 'squats':
        return 0.3 // 30% chance every 3 seconds
      case 'bicep-curls':
        return 0.4 // 40% chance every 3 seconds
      case 'lateral-raises':
        return 0.35 // 35% chance every 3 seconds
      default:
        return 0.25 // 25% chance every 3 seconds
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
        console.log('Connected to relay node')
        this.isConnectedToRelay = true
        this.reconnectAttempts = 0
        
        // Send device registration
        this.sendToRelay({
          type: 'device_register',
          deviceId: this.deviceId,
          exerciseType: this.exerciseType,
          timestamp: Date.now()
        })
      }

      this.relayConnection.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          this.handleRelayMessage(data)
        } catch (error) {
          console.error('Failed to parse relay message:', error)
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

    switch (messageType) {
      case 'ai_feedback':
        this.handleAIFeedback(data.payload)
        break
      case 'system_command':
        this.handleSystemCommand(data.payload)
        break
      case 'performance_metrics':
        this.handlePerformanceMetrics(data.payload)
        break
      case 'biometric_data':
        this.handleBiometricData(data.payload)
        break
      default:
        console.log('Unknown relay message type:', messageType)
    }
  }

  handleAIFeedback(payload) {
    console.log('Received AI feedback from server:', payload)
    
    // Update feedback panel with server data
    if (window.app) {
      window.app.updateFeedbackFromServer(payload)
    }
    
    // Update AR renderer with feedback
    if (window.arRenderer) {
      window.arRenderer.updateFeedbackVisuals(payload)
    }
  }

  handlePerformanceMetrics(payload) {
    console.log('Received performance metrics from server:', payload)
    
    // Update metrics display with server data
    if (this.onMetricsUpdate) {
      this.onMetricsUpdate(payload)
    }
    
    // Notify app to update metrics display
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
    const exerciseType = payload.exerciseType || payload.exercise_type
    if (!exerciseType) {
      console.error('No exercise type provided in select_exercise command')
      return
    }

    console.log(`Server command: Select exercise - ${exerciseType}`)
    
    // Validate exercise type
    const validExercises = ['bicep-curls', 'lateral-raises', 'squats', 'other']
    if (!validExercises.includes(exerciseType)) {
      console.warn(`Invalid exercise type: ${exerciseType}. Valid types: ${validExercises.join(', ')}`)
      return
    }

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
    
    // Close connection
    if (this.relayConnection) {
      this.relayConnection.close()
      this.relayConnection = null
      this.isConnectedToRelay = false
    }
    
    // Reset reconnect attempts
    this.reconnectAttempts = 0
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
}

// Make globally available
window.DummyDataProvider = DummyDataProvider

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
  module.exports = DummyDataProvider
}