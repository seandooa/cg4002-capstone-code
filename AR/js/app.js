class FitnessARApp {
  constructor() {
    this.isInitialized = false
    this.isWorkoutActive = false
    this.currentExercise = null
    this.selectedExercise = null

    // Core components
    this.poseDetector = null
    this.arRenderer = null
    this.threejsRenderer = null
    this.dummyDataProvider = null
    this.sideCameraManager = null
    this.integratedAvatarSystem = null // New integrated avatar system

    // Camera and video
    this.videoElement = null
    this.stream = null

    // Workout tracking
    this.workoutStartTime = null
    this.exerciseStartTime = null  // Track when exercise actually starts (not just workout start)
    this.exerciseStarted = false   // Track if exercise has actually started
    this.workoutStats = {
      duration: 0,
      totalReps: 0,
      avgHeartRate: 0,
      caloriesBurned: 0,
      heartRateReadings: [],
    }

    // Animation and detection
    this.detectionLoop = null
    this.lastPoseTime = 0
    // Use lower FPS on mobile to prevent performance issues
    this.detectionInterval = this.isMobile ? 200 : 100 // 5 FPS on mobile, 10 FPS on desktop

    // Mobile and fullscreen handling
    this.isMobile = this.detectMobile()
    this.isFullscreen = false
    this.fullscreenElement = null

    this.initialize()
  }

  async initialize() {
    try {
      console.log("Initializing AR Fitness App...")

      // Initialize core components
      await this.initializeComponents()

      // Setup UI event listeners
      this.setupEventListeners()

      // Setup mobile-specific features
      this.setupMobileFeatures()

      // Initialize camera asynchronously
      this.initializeCamera().catch(error => {
        console.warn("Camera initialization failed, but app will continue:", error)
        this.showStatus("Camera not available", false, 3000)
      })

      this.isInitialized = true
      console.log("AR Fitness App initialized successfully")
      console.log("Waiting for server commands to control exercise and workout...")
    } catch (error) {
      console.error("Failed to initialize AR Fitness App:", error)
        this.showStatus("Failed to initialize app. Please refresh and try again.", true)
    }
  }

  async initializeComponents() {
    try {
      // Wait for available classes
      const availableClasses = await this.waitForClasses()
      console.log("Available classes:", availableClasses.map(([name]) => name))
      
      // Initialize pose detector if available
      if (window.PoseDetector) {
        try {
          this.poseDetector = new window.PoseDetector()
          await this.poseDetector.initialize()
          window.poseDetector = this.poseDetector // Make globally available
          console.log("Pose detector initialized successfully")
        } catch (error) {
          console.error("Failed to initialize pose detector:", error)
          console.log("Continuing without pose detection...")
          this.poseDetector = null
        }
      } else {
        console.log("PoseDetector not available, skipping...")
        this.poseDetector = null
      }

      // Initialize AR renderer if available
      if (window.ARRenderer) {
        try {
          this.arRenderer = new window.ARRenderer("ar-overlay", null)
          window.arRenderer = this.arRenderer // Make globally available
          console.log("AR renderer initialized successfully")
        } catch (error) {
          console.error("Failed to initialize AR renderer:", error)
          this.arRenderer = null
        }
      } else {
        console.log("ARRenderer not available, skipping...")
        this.arRenderer = null
      }
      
      // Initialize ThreeJS renderer if available
      if (window.ThreeJSRenderer) {
        try {
          this.threejsRenderer = new window.ThreeJSRenderer("threejs-overlay")
          console.log("ThreeJS renderer initialized successfully")
        } catch (error) {
          console.error("Failed to initialize ThreeJS renderer:", error)
          this.threejsRenderer = null
        }
      } else {
        console.log("ThreeJSRenderer not available, skipping...")
        this.threejsRenderer = null
      }

      // Initialize dummy data provider if available
      if (window.DummyDataProvider) {
        try {
          this.dummyDataProvider = new window.DummyDataProvider()
          this.setupDummyDataCallbacks()
          console.log("Dummy data provider initialized successfully")
        } catch (error) {
          console.error("Failed to initialize dummy data provider:", error)
          this.dummyDataProvider = null
        }
      } else {
        console.log("DummyDataProvider not available, skipping...")
        this.dummyDataProvider = null
      }

      // Initialize side camera manager if available
      if (window.SideCameraManager) {
        try {
          this.sideCameraManager = new window.SideCameraManager()
          console.log("Side camera manager initialized successfully")
          
          // Auto-connect side camera on mobile devices
          if (this.isMobile) {
            console.log("Mobile device detected - auto-connecting side camera")
            setTimeout(() => {
              if (this.sideCameraManager) {
                this.sideCameraManager.connectSideCamera()
              }
            }, 2000) // Wait 2 seconds for initialization
          }
        } catch (error) {
          console.error("Failed to initialize side camera manager:", error)
          this.sideCameraManager = null
        }
      } else {
        console.log("SideCameraManager not available, skipping...")
        this.sideCameraManager = null
      }

      // Initialize integrated avatar system if available
      if (window.IntegratedAvatarSystem) {
        try {
          this.integratedAvatarSystem = new window.IntegratedAvatarSystem("side-avatar-canvas", "side-camera-feed")
          
          // Set up callbacks
          this.integratedAvatarSystem.onPoseDetected = (pose) => {
            // Handle pose detection for UI updates
            this.handlePoseDetected(pose)
          }
          
          this.integratedAvatarSystem.onRepCounted = (repCount) => {
            // Handle rep counting
            this.handleRepDetected(repCount)
          }
          
          this.integratedAvatarSystem.onError = (error) => {
            console.error("Integrated Avatar System error:", error)
          }
          
          console.log("Integrated Avatar System initialized successfully")
        } catch (error) {
          console.error("Failed to initialize Integrated Avatar System:", error)
          this.integratedAvatarSystem = null
        }
      } else {
        console.log("IntegratedAvatarSystem not available, skipping...")
        this.integratedAvatarSystem = null
      }

      console.log("Component initialization completed")
    } catch (error) {
      console.error("Failed to initialize components:", error)
      // Don't throw error, continue with basic functionality
      console.log("Continuing with basic app functionality...")
    }
  }

  async waitForClasses() {
    const maxWaitTime = 5000 // 5 seconds
    const startTime = Date.now()
    
    // Check which classes are available
    const requiredClasses = {
      PoseDetector: window.PoseDetector,
      ARRenderer: window.ARRenderer,
      ThreeJSRenderer: window.ThreeJSRenderer,
      DummyDataProvider: window.DummyDataProvider,
      SideCameraManager: window.SideCameraManager,
      SideAvatar3D: window.SideAvatar3D
    }
    
    while (Date.now() - startTime < maxWaitTime) {
      const availableClasses = Object.entries(requiredClasses).filter(([name, cls]) => cls !== undefined)
      
      if (availableClasses.length > 0) {
        console.log(`Found ${availableClasses.length} classes:`, availableClasses.map(([name]) => name))
        return availableClasses
      }
      
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    
    console.warn("Some classes not loaded within timeout, continuing with available classes")
    return Object.entries(requiredClasses).filter(([name, cls]) => cls !== undefined)
  }

  setupDummyDataCallbacks() {
    if (!this.dummyDataProvider) return
    
    this.dummyDataProvider.onMetricsUpdate = (metrics) => {
      this.updateMetricsDisplay(metrics)
    }

    this.dummyDataProvider.onRepDetected = (repCount) => {
      this.handleRepDetected(repCount)
    }

    this.dummyDataProvider.onExerciseStateChange = (state) => {
      console.log(`Exercise state changed: ${state}`)
    }

    // Configure relay node connection
    this.configureRelayNode()
  }

  async getLocalIP() {
    try {
      // Try to detect local IP using WebRTC
      const pc = new RTCPeerConnection({ iceServers: [] })
      pc.createDataChannel('')
      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)
      
      return new Promise((resolve) => {
        const foundIPs = []
        
        pc.onicecandidate = (ice) => {
          if (!ice || !ice.candidate || !ice.candidate.candidate) {
            // All candidates received, pick the best one
            if (foundIPs.length > 0) {
              // Prioritize: 192.168.x.x > 10.x.x.x > others (avoid 172.x for Hyper-V, 169.254 for APIPA)
              const preferredIP = foundIPs.find(ip => ip.startsWith('192.168.')) ||
                                  foundIPs.find(ip => ip.startsWith('10.')) ||
                                  foundIPs.find(ip => !ip.startsWith('172.') && !ip.startsWith('169.254.')) ||
                                  foundIPs[0]
              
              console.log('🔍 Found IPs:', foundIPs)
              console.log('✓ Selected IP:', preferredIP)
              resolve(preferredIP)
            } else {
              resolve(null)
            }
            pc.close()
            return
          }
          
          const ipRegex = /([0-9]{1,3}\.){3}[0-9]{1,3}/
          const ipMatch = ice.candidate.candidate.match(ipRegex)
          if (ipMatch && ipMatch[0]) {
            const ip = ipMatch[0]
            // Filter out localhost and multicast
            if (!ip.startsWith('127.') && !ip.startsWith('0.') && !ip.startsWith('255.')) {
              if (!foundIPs.includes(ip)) {
                foundIPs.push(ip)
              }
            }
          }
        }
        
        // Timeout after 3 seconds (increased from 2)
        setTimeout(() => {
          pc.close()
          if (foundIPs.length > 0) {
            const preferredIP = foundIPs.find(ip => ip.startsWith('192.168.')) ||
                                foundIPs.find(ip => ip.startsWith('10.')) ||
                                foundIPs.find(ip => !ip.startsWith('172.') && !ip.startsWith('169.254.')) ||
                                foundIPs[0]
            console.log('⏱️  Timeout: Found IPs:', foundIPs)
            console.log('✓ Selected IP:', preferredIP)
            resolve(preferredIP)
          } else {
            resolve(null)
          }
        }, 3000)
      })
    } catch (error) {
      console.warn('Could not detect local IP:', error)
      return null
    }
  }

  async configureRelayNode() {
    if (!this.dummyDataProvider) return

    // Check if there's a saved relay URL in localStorage first
    const savedRelayUrl = localStorage.getItem('relayNodeUrl')
    let relayUrl = savedRelayUrl

    if (!relayUrl || relayUrl.trim() === '') {
      // No saved URL, so auto-detect
      console.log('📡 No saved relay URL found, auto-detecting...')
      
      // For mobile devices, use the current page's hostname (which is the server's IP)
      // For localhost access, try to detect the actual server IP
      let detectedIP = window.location.hostname
      
      // Only try auto-detection if we're on localhost (laptop access)
      if (detectedIP === 'localhost' || detectedIP === '127.0.0.1') {
        const localIP = await this.getLocalIP()
        detectedIP = localIP || detectedIP
      }
      
      // If still no IP or got localhost, warn user
      if (!detectedIP || detectedIP === 'localhost' || detectedIP === '127.0.0.1') {
        console.warn('⚠️  Could not detect IP address automatically')
        detectedIP = window.location.hostname || 'localhost'
      }
      
      // Warn if we detected a virtual adapter IP (only for localhost detection)
      if (detectedIP.startsWith('172.') && window.location.hostname === 'localhost') {
        console.warn('⚠️  Detected Hyper-V/WSL virtual adapter IP:', detectedIP)
        console.warn('⚠️  If connection fails, check your WiFi IP (ipconfig) and set manually in Relay Settings')
      }
      
      // Determine protocol based on current page protocol
      const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws'
      relayUrl = `${protocol}://${detectedIP}:8080`

      console.log('=' .repeat(70))
      console.log('🔧 AR FITNESS APP - RELAY CONFIGURATION (Auto-Detected)')
      console.log('=' .repeat(70))
      console.log(`📡 Detected IP Address: ${detectedIP}`)
      console.log(`🔗 Relay URL: ${relayUrl}`)
      console.log(`🔒 Protocol: ${protocol === 'wss' ? 'Secure (WSS)' : 'Non-Secure (WS)'}`)
      
      // Show warning if might be wrong
      if (detectedIP.startsWith('172.') || detectedIP.startsWith('169.254.')) {
        console.log(`⚠️  Warning: This might be a virtual adapter IP!`)
        console.log(`💡 Expected WiFi IP format: 192.168.x.x or 10.179.x.x`)
        console.log(`💡 If connection fails, manually set in Relay Settings`)
      }
      
      console.log('💡 TIP: If the server is on a different machine, configure it manually in Relay Settings')
      console.log('')
      console.log('📋 TO CONFIGURE MANUALLY:')
      console.log('   1. Click the "Relay Settings" button in the UI')
      console.log('   2. Enter the server URL (e.g., ws://10.179.214.103:8080 or wss://10.179.214.103:8080)')
      console.log('   3. Click "Save Configuration"')
      console.log('   4. The URL will be saved and used on future loads')
      console.log('')
      console.log('⚠️  NOTE: Make sure the protocol matches the server:')
      console.log('   - If server uses SSL: wss://IP:8080')
      console.log('   - If server uses no SSL: ws://IP:8080')
      console.log('=' .repeat(70))
    } else {
      // Use saved URL, but update protocol if needed
      console.log('=' .repeat(70))
      console.log('🔧 AR FITNESS APP - RELAY CONFIGURATION (Using Saved URL)')
      console.log('=' .repeat(70))
      console.log(`🔗 Using saved Relay URL: ${relayUrl}`)
      
      // Update protocol to match current page if URL doesn't have explicit protocol
      try {
        const urlObj = new URL(relayUrl)
        const currentProtocol = window.location.protocol === 'https:' ? 'wss' : 'ws'
        if ((urlObj.protocol === 'ws:' && currentProtocol === 'wss') || 
            (urlObj.protocol === 'wss:' && currentProtocol === 'ws')) {
          // Protocol mismatch - keep saved protocol but warn
          console.log(`🔒 Protocol: ${urlObj.protocol === 'wss:' ? 'Secure (WSS)' : 'Non-Secure (WS)'}`)
        } else {
          console.log(`🔒 Protocol: ${urlObj.protocol === 'wss:' ? 'Secure (WSS)' : 'Non-Secure (WS)'}`)
        }
      } catch (e) {
        console.warn('⚠️  Invalid saved URL format, will attempt to use it anyway')
      }
      
      console.log('=' .repeat(70))
    }

    // Force reset configuration to ensure correct IP address
    if (window.RelayNodeConfig) {
      const relayConfigManager = new window.RelayNodeConfig()
      relayConfigManager.forceResetConfig()
    }

    // Always enable relay node connection by default
    const relayConfig = {
      enabled: true, // Always enabled
      url: relayUrl,
      reconnectInterval: parseInt(localStorage.getItem('relayNodeReconnectInterval')) || 5000,
      maxReconnectAttempts: parseInt(localStorage.getItem('relayNodeMaxReconnectAttempts')) || 10
    }

    // Save the configuration (only if we auto-detected, preserve saved values otherwise)
    if (!savedRelayUrl || savedRelayUrl.trim() === '') {
      localStorage.setItem('relayNodeUrl', relayUrl)
    }
    localStorage.setItem('relayNodeEnabled', 'true')
    localStorage.setItem('relayNodeReconnectInterval', relayConfig.reconnectInterval.toString())
    localStorage.setItem('relayNodeMaxReconnectAttempts', relayConfig.maxReconnectAttempts.toString())

    this.dummyDataProvider.configureRelayNode(relayConfig)

    // Update UI with relay URL
    const relayUrlDisplay = document.getElementById('relay-url-display')
    if (relayUrlDisplay) {
      relayUrlDisplay.textContent = relayUrl
    }
    
    // Update the input field in the modal if it exists
    const relayUrlInput = document.getElementById('relay-url')
    if (relayUrlInput) {
      relayUrlInput.value = relayUrl
    }

    // Always attempt to connect
    console.log(`⏳ Auto-connecting to relay node at ${relayUrl}...`)
    this.dummyDataProvider.connectToRelayNode()

    // Start periodic status updates
    this.startRelayStatusUpdates()
  }

  startRelayStatusUpdates() {
    // Update relay status every 2 seconds
    setInterval(() => {
      this.updateRelayStatusDisplay()
    }, 2000)
  }

  setupEventListeners() {
    console.log("Setting up event listeners...")

    // Control buttons
    const toggleSkeletonBtn = document.getElementById("toggle-skeleton")
    const relayConfigBtn = document.getElementById("relay-config")
    const toggleFullscreenBtn = document.getElementById("toggle-fullscreen")

    if (toggleSkeletonBtn) toggleSkeletonBtn.addEventListener("click", () => this.toggleSkeleton())
    if (relayConfigBtn) relayConfigBtn.addEventListener("click", () => this.showRelayConfigModal())
    if (toggleFullscreenBtn) toggleFullscreenBtn.addEventListener("click", () => this.toggleFullscreen())

    // Summary modal
    const closeSummaryBtn = document.getElementById("close-summary")
    if (closeSummaryBtn) {
      closeSummaryBtn.addEventListener("click", () => this.closeSummaryModal())
    }

    // Relay configuration modal
    const closeRelayConfigBtn = document.getElementById("close-relay-config")
    const saveRelayConfigBtn = document.getElementById("save-relay-config")
    const testRelayConnectionBtn = document.getElementById("test-relay-connection")
    
    if (closeRelayConfigBtn) {
      closeRelayConfigBtn.addEventListener("click", () => this.closeRelayConfigModal())
    }
    if (saveRelayConfigBtn) {
      saveRelayConfigBtn.addEventListener("click", () => this.saveRelayConfig())
    }
    if (testRelayConnectionBtn) {
      testRelayConnectionBtn.addEventListener("click", () => this.testRelayConnection())
    }

    // Handle orientation change
    window.addEventListener("orientationchange", () => {
      setTimeout(() => {
        this.handleOrientationChange()
        // Force canvas resize on orientation change
        if (this.arRenderer) {
          this.arRenderer.forceResize()
        }
      }, 500)
    })
    
    // Handle window resize
    window.addEventListener("resize", () => {
      if (this.arRenderer) {
        this.arRenderer.forceResize()
      }
    })
  }

  async initializeCamera() {
    try {
      console.log("Initializing camera...")
      this.showStatus("Initializing camera...")

      // Check if camera is supported
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error("Camera not supported in this browser")
      }

      // Check if we're in a secure context (required for camera access)
      if (location.protocol !== 'https:' && location.hostname !== 'localhost') {
        throw new Error("Camera requires HTTPS or localhost. Please use HTTPS or access via localhost.")
      }

      // Request camera access with fallback options
      let stream
      try {
        // Try back camera first
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: "environment",
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
        })
      } catch (backCameraError) {
        console.warn("Back camera failed, trying front camera:", backCameraError)
        // Fallback to front camera
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: "user",
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
        })
      }

      this.stream = stream
      this.videoElement = document.getElementById("camera-feed")
      
      if (!this.videoElement) {
        throw new Error("Camera feed element not found")
      }

      this.videoElement.srcObject = this.stream

      // Wait for video to load with timeout
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error("Camera video load timeout"))
        }, 10000) // 10 second timeout

        this.videoElement.onloadedmetadata = () => {
          clearTimeout(timeout)
          resolve()
        }

        this.videoElement.onerror = () => {
          clearTimeout(timeout)
          reject(new Error("Camera video load error"))
        }
      })

      // Update AR renderer with video element
      if (this.arRenderer) {
        this.arRenderer.setVideoElement(this.videoElement)
      }

      // Update camera status
      this.updateCameraStatus("main", true)

      console.log("Camera initialized successfully")
      this.hideStatus()
      
      // Show success message briefly
      this.showStatus("Camera ready!", false, 2000)
      
    } catch (error) {
      console.error("Failed to initialize camera:", error)
      
      // Provide specific error messages
      let errorMessage = "Camera not available"
      if (error.message.includes("Permission denied") || error.message.includes("NotAllowedError")) {
        errorMessage = "Camera access denied. Please allow camera access and refresh."
      } else if (error.message.includes("NotFoundError")) {
        errorMessage = "No camera found on this device."
      } else if (error.message.includes("NotSupportedError")) {
        errorMessage = "Camera not supported in this browser."
      } else if (error.message.includes("HTTPS")) {
        errorMessage = "Camera requires HTTPS or localhost."
      }
      
      this.showStatus(errorMessage, true, 5000)
      this.updateCameraStatus("main", false)
      
      // Continue with app initialization even if camera fails
      console.log("Continuing app initialization without camera...")
    }
  }

  // Server command handlers
  handleServerExerciseSelection(exerciseType) {
    // Validate exercise type - use "Hr Only" if empty or invalid
    const validExercises = ['Hr Only', 'lateral-raises', 'squats', 'bicep-curls']
    
    if (!exerciseType || exerciseType.trim() === '' || !validExercises.includes(exerciseType)) {
      console.warn(`Invalid or empty exercise type: "${exerciseType}". Defaulting to "Hr Only"`)
      exerciseType = 'Hr Only'
    }
    
    console.log(`Server selected exercise: ${exerciseType}`)
    
    this.currentExercise = exerciseType
    this.selectedExercise = exerciseType

    // Update components with selected exercise
    if (this.poseDetector) {
      this.poseDetector.setExerciseType(this.currentExercise)
    }
    if (this.dummyDataProvider) {
      this.dummyDataProvider.setExerciseType(this.currentExercise)
    }
    
    // Update integrated avatar system with exercise type
    if (this.integratedAvatarSystem) {
      this.integratedAvatarSystem.setExerciseType(this.currentExercise)
    }
    
    // Update side camera avatar
    if (this.sideCameraManager) {
      this.sideCameraManager.setExerciseType(this.currentExercise)
    }

    // Update UI
    this.updateExerciseDisplay(this.currentExercise)

    const exerciseName = this.currentExercise.replace("-", " ").replace(/\b\w/g, (l) => l.toUpperCase())
    this.showStatus(`Server selected: ${exerciseName}`, false, 2000)
  }

  handleServerStartWorkout() {
    console.log('Server command: Start workout')
    
    if (!this.currentExercise) {
      console.warn('Cannot start workout: No exercise selected')
      this.showStatus("No exercise selected. Waiting for server command.", true, 3000)
      return
    }

    this.startWorkout()
    this.showStatus("Workout started by server", false, 2000)
  }

  handleServerStopWorkout() {
    console.log('Server command: Stop workout')
    
    if (!this.isWorkoutActive) {
      console.warn('Cannot stop workout: No active workout')
      return
    }

    this.stopWorkout()
    this.showStatus("Workout stopped by server", false, 2000)
  }

  handleServerPauseWorkout() {
    console.log('Server command: Pause workout')
    
    if (!this.isWorkoutActive) {
      console.warn('Cannot pause workout: No active workout')
      return
    }

    // Implement pause logic if needed
    this.showStatus("Workout paused by server", false, 2000)
  }

  // ========================================================================
  // SERVER DATA HANDLERS - Update UI with data from server
  // ========================================================================

  updateMetricsFromServer(metrics) {
    // Always log when updating metrics from server
    console.log('[UI Update] Updating metrics display from server:', {
      heartRate: metrics.heartRate,
      pulse: metrics.pulse,
      repCount: metrics.repCount,
      workoutDuration: metrics.workoutDuration,
      caloriesBurned: metrics.caloriesBurned
    })
    
    // Update heart rate
    const heartRateElement = document.getElementById("heart-rate")
    if (heartRateElement && metrics.heartRate !== undefined) {
      heartRateElement.textContent = `${metrics.heartRate} bpm`
    }

    // Update rep count
    const repCountElement = document.getElementById("rep-count")
    if (repCountElement && metrics.repCount !== undefined) {
      repCountElement.textContent = metrics.repCount
      // Store for workout stats
      if (this.workoutStats) {
        this.workoutStats.totalReps = metrics.repCount
      }
    }

    // Update workout duration - only start timer when exercise actually starts
    // For HR only mode, always keep timer at 00:00
    const durationElement = document.getElementById("workout-duration")
    if (durationElement) {
      // Check if in HR only mode
      if (this.currentExercise === 'Hr Only') {
        // HR only mode: always show 00:00
        durationElement.textContent = "00:00"
        if (this.workoutStats) {
          this.workoutStats.duration = 0
        }
      } else {
        // For other exercises, check if exercise has actually started
        // Exercise starts when we get the first rep (repCount > 0) or when server sends workoutDuration > 0
        if (!this.exerciseStarted && metrics.repCount > 0) {
          // Exercise has started - mark it and start tracking
          this.exerciseStarted = true
          this.exerciseStartTime = Date.now()
          console.log('Exercise started - timer will begin counting')
        }
        
        // Only show timer if exercise has started
        if (this.exerciseStarted && metrics.workoutDuration !== undefined) {
          // Calculate duration from when exercise actually started
          // Use server's workoutDuration but only if exercise has started
          const minutes = Math.floor(metrics.workoutDuration / 60)
          const seconds = metrics.workoutDuration % 60
          durationElement.textContent = `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`
          // Store for workout stats
          if (this.workoutStats) {
            this.workoutStats.duration = metrics.workoutDuration
          }
        } else {
          // Exercise hasn't started yet - show 00:00
          durationElement.textContent = "00:00"
          if (this.workoutStats) {
            this.workoutStats.duration = 0
          }
        }
      }
    }

    // Calculate and store calories for summary (not displayed in performance metrics)
    if (this.workoutStats) {
      const calories = metrics.caloriesBurned || 
                      Math.round((metrics.workoutDuration || 0) * 0.1 + (metrics.repCount || 0) * 0.5)
      this.workoutStats.caloriesBurned = calories
    }

    // Store heart rate for average calculation
    if (metrics.heartRate && this.workoutStats) {
      if (!this.workoutStats.heartRateReadings) {
        this.workoutStats.heartRateReadings = []
      }
      this.workoutStats.heartRateReadings.push(metrics.heartRate)
    }
  }

  updateFeedbackFromServer(feedbackData) {
    console.log('[UI Update] Updating feedback from server:', feedbackData)
    
    const feedbackStatus = document.getElementById("feedback-status")
    const suggestionsList = document.getElementById("suggestions-list")
    
    if (!feedbackStatus) {
      console.error('[UI Update] Feedback status element not found!')
      return
    }
    if (!suggestionsList) {
      console.error('[UI Update] Suggestions list element not found!')
      return
    }

    // Handle string feedback from server
    const feedbackMsg = feedbackData.feedback
    
    if (feedbackMsg === "Error") {
      // Don't update if valid_check=0 (Error)
      console.log('[UI Update] Received Error - keeping previous feedback')
      return
    }

    let status, statusText
    if (feedbackMsg === "Good Form") {
      status = "good"
      statusText = "Good"
    } else if (feedbackMsg === "Bad Form") {
      status = "error"
      statusText = "Bad"
    } else {
      // Unknown feedback - skip update
      console.warn('[UI Update] Unknown feedback message:', feedbackMsg)
      return
    }
    
    // Update status with appropriate class and text
    feedbackStatus.className = `feedback-${status}`
    console.log('[UI Update] Set feedback class to:', `feedback-${status}`)
    
    feedbackStatus.textContent = statusText
    console.log('[UI Update] Set feedback text to:', statusText)

    // Clear suggestions (as per simplified feedback)
    suggestionsList.innerHTML = ''
  }

  // Update your waitForClasses method to include SideAvatar3D:
async waitForClasses() {
  const maxWaitTime = 5000 // 5 seconds
  const startTime = Date.now()
  
  // Check which classes are available
  const requiredClasses = {
    PoseDetector: window.PoseDetector,
    ARRenderer: window.ARRenderer,
    ThreeJSRenderer: window.ThreeJSRenderer,
    DummyDataProvider: window.DummyDataProvider,
    SideCameraManager: window.SideCameraManager,
    SideAvatar3D: window.SideAvatar3D // ADD THIS LINE
  }
  
  while (Date.now() - startTime < maxWaitTime) {
    const availableClasses = Object.entries(requiredClasses).filter(([name, cls]) => cls !== undefined)
    
    if (availableClasses.length > 0) {
      console.log(`Found ${availableClasses.length} classes:`, availableClasses.map(([name]) => name))
      return availableClasses
    }
    
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  
  console.warn("Some classes not loaded within timeout, continuing with available classes")
  return Object.entries(requiredClasses).filter(([name, cls]) => cls !== undefined)
}

// Update your dispose method to include avatar cleanup:
dispose() {
  this.stopWorkout()

  if (this.stream) {
    this.stream.getTracks().forEach((track) => track.stop())
  }

  if (this.threejsRenderer) {
    this.threejsRenderer.dispose()
  }

  if (this.sideCameraManager) {
    this.sideCameraManager.dispose() // This will now also dispose the 3D avatar
    }
  }

  async startWorkout() {
    if (!this.currentExercise || this.isWorkoutActive) return

    try {
      console.log(`Starting ${this.currentExercise} workout...`)

      this.isWorkoutActive = true
      this.workoutStartTime = Date.now()
      this.exerciseStartTime = null  // Will be set when exercise actually starts
      this.exerciseStarted = false   // Reset exercise started flag

      // Reset workout stats
      this.resetWorkoutStats()
      
      // Reset timer display to 00:00
      const durationElement = document.getElementById("workout-duration")
      if (durationElement) {
        durationElement.textContent = "00:00"
      }

      // Start relay server connection
      if (this.dummyDataProvider) {
        this.dummyDataProvider.startWorkout()
      }

      // Start pose detection loop
      if (this.poseDetector) {
        this.startPoseDetection()
      }

      // Start integrated avatar system
      if (this.integratedAvatarSystem) {
        this.integratedAvatarSystem.start()
      }

      // Update UI
      this.updateWorkoutControls(true)

      this.showStatus("Workout started! Begin your exercise.", false, 2000)
    } catch (error) {
      console.error("Failed to start workout:", error)
      this.showStatus("Failed to start workout. Please try again.", true)
    }
  }

  stopWorkout() {
    if (!this.isWorkoutActive) return

    console.log("Stopping workout...")

    this.isWorkoutActive = false
    this.exerciseStarted = false
    this.exerciseStartTime = null

    // Reset timer display to 00:00
    const durationElement = document.getElementById("workout-duration")
    if (durationElement) {
      durationElement.textContent = "00:00"
    }

    // Stop relay server connection
    if (this.dummyDataProvider) {
      this.dummyDataProvider.stopWorkout()
    }

    // Stop pose detection
    if (this.poseDetector) {
      this.stopPoseDetection()
    }

    // Stop integrated avatar system
    if (this.integratedAvatarSystem) {
      this.integratedAvatarSystem.stop()
    }

    // Calculate final stats
    this.calculateFinalStats()

    // Update UI
    this.updateWorkoutControls(false)

    // Show workout summary
    this.showWorkoutSummary()

    console.log("Workout stopped")
  }

  startPoseDetection() {
    if (!this.poseDetector) {
      console.log("Pose detector not available, skipping pose detection")
      return
    }
    
    const detectPoses = async () => {
      if (!this.isWorkoutActive || !this.videoElement) return

      const currentTime = Date.now()
      if (currentTime - this.lastPoseTime < this.detectionInterval) {
        // Use setTimeout on mobile, requestAnimationFrame on desktop
        if (this.isMobile) {
          this.detectionLoop = setTimeout(detectPoses, this.detectionInterval - (currentTime - this.lastPoseTime))
        } else {
          this.detectionLoop = requestAnimationFrame(detectPoses)
        }
        return
      }

      try {
        // Detect poses with timeout protection for mobile
        const detectionTimeout = this.isMobile ? 500 : 1000 // Shorter timeout on mobile
        const posesPromise = this.poseDetector.detectPoses(this.videoElement)
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Pose detection timeout')), detectionTimeout)
        )
        
        const poses = await Promise.race([posesPromise, timeoutPromise])

        if (poses && poses.length > 0) {
          // Get posture analysis (skip if it takes too long on mobile)
          let analysis = null
          try {
            analysis = this.poseDetector.getPostureAnalysis(poses)
          } catch (analysisError) {
            console.warn("Posture analysis failed, continuing without it:", analysisError)
            // Continue without analysis - skeleton will still render
          }

          // Get highlighted joints (only if analysis succeeded)
          const highlightedJoints = analysis ? this.poseDetector.getHighlightedJoints(analysis) : []

          // Update AR overlays - use only AR renderer for mobile, ThreeJS for desktop
          if (this.isMobile) {
            // Mobile: Use only AR renderer (2D canvas)
            if (this.arRenderer) {
              this.arRenderer.showSkeleton = true
              // Only resize if needed (not every frame to improve performance)
              // Skip forceResize on mobile - it's expensive and usually not needed
              this.arRenderer.drawPoses(poses, highlightedJoints)
            }
            // Disable ThreeJS renderer on mobile
            if (this.threejsRenderer) {
              this.threejsRenderer.setVisibility(false)
            }
          } else {
            // Desktop: Use ThreeJS renderer
            if (this.threejsRenderer) {
              this.threejsRenderer.setVisibility(true)
              this.threejsRenderer.drawPoses(poses, highlightedJoints)
            }
            // Disable AR renderer on desktop
            if (this.arRenderer) {
              this.arRenderer.showSkeleton = false
              this.arRenderer.clear()
            }
          }

          // Update feedback (only if analysis succeeded)
          if (analysis && this.arRenderer) {
            this.arRenderer.updateFeedbackVisuals(analysis)
          }

          // Send pose data to side camera
          if (this.sideCameraManager) {
            this.sideCameraManager.sendPoseDataToSide(poses[0])
          }

          // Send pose data to relay node
          if (this.dummyDataProvider && this.dummyDataProvider.isConnectedToRelay) {
            this.dummyDataProvider.sendPoseDataToRelay(poses[0])
          }
        }

        this.lastPoseTime = currentTime
      } catch (error) {
        // On mobile, log but don't spam console with errors
        if (!this.isMobile || error.message !== 'Pose detection timeout') {
          console.error("Error in pose detection:", error)
        }
        // Continue the loop even on error to prevent freezing
      }

      // Use setTimeout on mobile instead of requestAnimationFrame for better performance
      // This prevents the animation frame queue from backing up on slower devices
      if (this.isMobile) {
        this.detectionLoop = setTimeout(detectPoses, this.detectionInterval)
      } else {
        this.detectionLoop = requestAnimationFrame(detectPoses)
      }
    }

    detectPoses()
  }

  stopPoseDetection() {
    if (this.detectionLoop) {
      // Cancel animation frame (desktop) or timeout (mobile)
      if (typeof this.detectionLoop === 'number') {
        if (this.isMobile) {
          clearTimeout(this.detectionLoop)
        } else {
          cancelAnimationFrame(this.detectionLoop)
        }
      }
      this.detectionLoop = null
    }

    // Clear overlays
    if (this.arRenderer) {
      this.arRenderer.clear()
    }
    if (this.threejsRenderer) {
      this.threejsRenderer.clearSkeleton()
    }
  }

  toggleSkeleton() {
    if (!this.arRenderer) {
      console.log("AR renderer not available")
      return
    }
    
    const isVisible = this.arRenderer.toggleSkeleton()
    
    if (this.threejsRenderer) {
      this.threejsRenderer.setVisibility(isVisible)
    }

    const toggleBtn = document.getElementById("toggle-skeleton")
    if (toggleBtn) {
      toggleBtn.textContent = isVisible ? "Hide Skeleton" : "Show Skeleton"
    }
  }

  updateMetricsDisplay(metrics) {
    if (!metrics) return
    
    // Update heart rate
    const heartRateElement = document.getElementById("heart-rate")
    if (heartRateElement) {
      heartRateElement.textContent = `${metrics.heartRate || 0} bpm`
    }

    // Update rep count
    const repCountElement = document.getElementById("rep-count")
    if (repCountElement) {
      repCountElement.textContent = metrics.repCount || 0
    }

    // Update workout duration - only start timer when exercise actually starts
    // For HR only mode, always keep timer at 00:00
    const durationElement = document.getElementById("workout-duration")
    if (durationElement) {
      // Check if in HR only mode
      if (this.currentExercise === 'Hr Only') {
        // HR only mode: always show 00:00
        durationElement.textContent = "00:00"
        this.workoutStats.duration = 0
      } else {
        // For other exercises, check if exercise has actually started
        // Exercise starts when we get the first rep (repCount > 0)
        if (!this.exerciseStarted && metrics.repCount > 0) {
          // Exercise has started - mark it and start tracking
          this.exerciseStarted = true
          this.exerciseStartTime = Date.now()
          console.log('Exercise started - timer will begin counting')
        }
        
        // Only show timer if exercise has started
        if (this.exerciseStarted && metrics.workoutDuration !== undefined) {
          const minutes = Math.floor(metrics.workoutDuration / 60)
          const seconds = metrics.workoutDuration % 60
          durationElement.textContent = `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`
          this.workoutStats.duration = metrics.workoutDuration
        } else {
          // Exercise hasn't started yet - show 00:00
          durationElement.textContent = "00:00"
          this.workoutStats.duration = 0
        }
      }
    }

    // Calculate and store calories for summary (not displayed in performance metrics)
    const calories = Math.round((metrics.workoutDuration || 0) * 0.1 + (metrics.repCount || 0) * 0.5)
    this.workoutStats.caloriesBurned = calories

    // Store heart rate for average calculation
    if (metrics.heartRate) {
      this.workoutStats.heartRateReadings.push(metrics.heartRate)
    }
    this.workoutStats.totalReps = metrics.repCount || 0
    this.workoutStats.duration = metrics.workoutDuration || 0
  }

  handleRepDetected(repCount) {
    if (repCount === undefined || repCount === null) return
    
    console.log(`Rep detected: ${repCount}`)

    // Add visual feedback for rep detection
    this.showStatus(`Rep ${repCount} completed!`, false, 1000)

    // Could add sound effect or haptic feedback here
  }

  updateExerciseDisplay(exercise) {
    const exerciseElement = document.getElementById("exercise-type")
    if (exerciseElement) {
      exerciseElement.textContent = exercise.replace("-", " ").replace(/\b\w/g, (l) => l.toUpperCase())
    }
  }

  updateWorkoutControls(isActive) {
    // No manual controls - all controlled by server
    console.log(`Workout state changed: ${isActive ? 'active' : 'inactive'}`)
  }

  updateCameraStatus(camera, connected) {
    const statusElement = document.getElementById(`${camera}-camera-status`)
    if (statusElement) {
      statusElement.textContent = connected ? "Connected" : "Disconnected"
      statusElement.className = `status-indicator ${connected ? "connected" : "disconnected"}`
    }
  }

  resetWorkoutStats() {
    this.workoutStats = {
      duration: 0,
      totalReps: 0,
      avgHeartRate: 0,
      caloriesBurned: 0,
      heartRateReadings: [],
    }
    this.exerciseStarted = false
    this.exerciseStartTime = null
  }

  calculateFinalStats() {
    if (this.workoutStats.heartRateReadings.length > 0) {
      const sum = this.workoutStats.heartRateReadings.reduce((a, b) => a + b, 0)
      this.workoutStats.avgHeartRate = Math.round(sum / this.workoutStats.heartRateReadings.length)
    }

    this.workoutStats.caloriesBurned = Math.round(this.workoutStats.duration * 0.1 + this.workoutStats.totalReps * 0.5)
  }

  showWorkoutSummary() {
    const modal = document.getElementById("summary-modal")
    if (!modal) return

    // Update summary data
    document.getElementById("summary-exercise").textContent = this.currentExercise
      .replace("-", " ")
      .replace(/\b\w/g, (l) => l.toUpperCase())

    const minutes = Math.floor(this.workoutStats.duration / 60)
    const seconds = this.workoutStats.duration % 60
    document.getElementById("summary-duration").textContent = `${minutes}:${seconds.toString().padStart(2, "0")}`

    document.getElementById("summary-reps").textContent = this.workoutStats.totalReps
    document.getElementById("summary-calories").textContent = this.workoutStats.caloriesBurned

    modal.style.display = "flex"

    // Auto-close after 5 seconds with countdown timer
    this.startSummaryTimer()
  }

  startSummaryTimer() {
    const timerElement = document.getElementById("summary-timer")
    if (!timerElement) return

    let secondsLeft = 5
    
    // Clear any existing timer
    if (this.summaryTimerInterval) {
      clearInterval(this.summaryTimerInterval)
    }

    // Update timer display
    const updateTimer = () => {
      if (secondsLeft > 0) {
        timerElement.textContent = `Closing in ${secondsLeft}s`
        secondsLeft--
      } else {
        clearInterval(this.summaryTimerInterval)
        this.closeSummaryModal()
      }
    }

    // Initial display
    updateTimer()

    // Start countdown
    this.summaryTimerInterval = setInterval(updateTimer, 1000)
  }

  closeSummaryModal() {
    const modal = document.getElementById("summary-modal")
    if (modal) {
      modal.style.display = "none"
    }

    // Clear the timer if it's still running
    if (this.summaryTimerInterval) {
      clearInterval(this.summaryTimerInterval)
      this.summaryTimerInterval = null
    }
  }

  showRelayConfigModal() {
    const modal = document.getElementById("relay-config-modal")
    if (modal) {
      // Load current configuration
      this.loadRelayConfigToUI()
      modal.style.display = "flex"
    }
  }

  closeRelayConfigModal() {
    const modal = document.getElementById("relay-config-modal")
    if (modal) {
      modal.style.display = "none"
    }
  }

  loadRelayConfigToUI() {
    // Load current configuration from localStorage or use current detected URL
    const storedUrl = localStorage.getItem('relayNodeUrl')
    const currentUrl = storedUrl || (this.dummyDataProvider ? this.dummyDataProvider.relayNodeConfig.url : '')
    
    const config = {
      enabled: true, // Always enabled
      url: currentUrl,
      reconnectInterval: parseInt(localStorage.getItem('relayNodeReconnectInterval')) || 5000,
      maxReconnectAttempts: parseInt(localStorage.getItem('relayNodeMaxReconnectAttempts')) || 10
    }

    const enabledCheckbox = document.getElementById("relay-enabled")
    const urlInput = document.getElementById("relay-url")
    const reconnectIntervalInput = document.getElementById("relay-reconnect-interval")
    const maxReconnectInput = document.getElementById("relay-max-reconnect")

    if (enabledCheckbox) {
      enabledCheckbox.checked = true // Always checked
      enabledCheckbox.disabled = true // Disable the checkbox since it's always enabled
    }
    if (urlInput) {
      urlInput.value = config.url
      urlInput.placeholder = config.url || 'Auto-detected URL will appear here'
    }
    if (reconnectIntervalInput) reconnectIntervalInput.value = config.reconnectInterval
    if (maxReconnectInput) maxReconnectInput.value = config.maxReconnectAttempts

    // Update status display
    this.updateRelayStatusDisplay()
  }

  saveRelayConfig() {
    const enabledCheckbox = document.getElementById("relay-enabled")
    const urlInput = document.getElementById("relay-url")
    const reconnectIntervalInput = document.getElementById("relay-reconnect-interval")
    const maxReconnectInput = document.getElementById("relay-max-reconnect")

    if (!enabledCheckbox || !urlInput || !reconnectIntervalInput || !maxReconnectInput) {
      console.error("Relay configuration UI elements not found")
      return
    }

    const config = {
      enabled: true, // Always enabled
      url: urlInput.value.trim(),
      reconnectInterval: parseInt(reconnectIntervalInput.value),
      maxReconnectAttempts: parseInt(maxReconnectInput.value)
    }

    // Validate configuration
    if (config.url && !this.isValidWebSocketUrl(config.url)) {
      this.showStatus("Invalid WebSocket URL format", true)
      return
    }

    if (config.reconnectInterval < 1000) {
      this.showStatus("Reconnect interval must be at least 1000ms", true)
      return
    }

    if (config.maxReconnectAttempts < 1) {
      this.showStatus("Max reconnect attempts must be at least 1", true)
      return
    }

    // Save to localStorage
    localStorage.setItem('relayNodeEnabled', config.enabled.toString())
    localStorage.setItem('relayNodeUrl', config.url)
    localStorage.setItem('relayNodeReconnectInterval', config.reconnectInterval.toString())
    localStorage.setItem('relayNodeMaxReconnectAttempts', config.maxReconnectAttempts.toString())

    // Update dummy data provider configuration
    if (this.dummyDataProvider) {
      this.dummyDataProvider.configureRelayNode(config)
      
      // Reconnect if enabled
      if (config.enabled) {
        this.dummyDataProvider.connectToRelayNode()
      } else {
        // Disconnect if disabled
        if (this.dummyDataProvider.relayConnection) {
          this.dummyDataProvider.relayConnection.close()
        }
      }
    }

    this.showStatus("Relay configuration saved successfully", false, 2000)
    this.updateRelayStatusDisplay()
  }

  testRelayConnection() {
    const urlInput = document.getElementById("relay-url")
    if (!urlInput) return

    const url = urlInput.value.trim()
    if (!url) {
      this.showStatus("Please enter a WebSocket URL", true)
      return
    }

    if (!this.isValidWebSocketUrl(url)) {
      this.showStatus("Invalid WebSocket URL format", true)
      return
    }

    this.showStatus("Testing connection...", false)
    
    // Create a temporary WebSocket connection for testing
    const testConnection = new WebSocket(url)
    
    testConnection.onopen = () => {
      this.showStatus("Connection test successful!", false, 2000)
      testConnection.close()
    }
    
    testConnection.onerror = () => {
      this.showStatus("Connection test failed - check URL and server status", true, 3000)
    }
    
    testConnection.onclose = () => {
      // Connection closed (either successful test or error)
    }
  }

  isValidWebSocketUrl(url) {
    try {
      const urlObj = new URL(url)
      return urlObj.protocol === 'ws:' || urlObj.protocol === 'wss:'
    } catch {
      return false
    }
  }

  updateRelayStatusDisplay() {
    const statusElement = document.getElementById("relay-status-text")
    const indicatorElement = document.getElementById("relay-status-indicator")
    const connectionStatusElement = document.getElementById("relay-connection-status")
    
    if (!this.dummyDataProvider) return

    const isConnected = this.dummyDataProvider.isConnectedToRelay
    const reconnectAttempts = this.dummyDataProvider.reconnectAttempts
    const maxAttempts = this.dummyDataProvider.relayNodeConfig.maxReconnectAttempts

    let statusText = "Disconnected from Relay Node"
    let statusClass = "relay-status-disconnected"
    let shortStatus = "Disconnected"

    if (isConnected) {
      statusText = "Connected to Relay Node"
      statusClass = "relay-status-connected"
      shortStatus = "Connected"
    } else if (reconnectAttempts > 0) {
      statusText = `Reconnecting... (${reconnectAttempts}/${maxAttempts})`
      statusClass = "relay-status-reconnecting"
      shortStatus = `Reconnecting (${reconnectAttempts}/${maxAttempts})`
    }

    // Update modal status
    if (statusElement) {
      statusElement.textContent = statusText
      statusElement.className = statusClass
    }

    // Update main UI indicator
    if (indicatorElement) {
      indicatorElement.className = statusClass
      const indicatorText = indicatorElement.querySelector('#relay-status-text')
      if (indicatorText) {
        indicatorText.textContent = statusText
      }
    }

    // Update connection panel status
    if (connectionStatusElement) {
      connectionStatusElement.textContent = shortStatus
      connectionStatusElement.className = `status-indicator ${isConnected ? 'connected' : 'disconnected'}`
    }
  }

  handleOrientationChange() {
    // Resize renderers after orientation change
    if (this.arRenderer) {
      this.arRenderer.forceResize()
    }

    if (this.threejsRenderer) {
      this.threejsRenderer.handleResize()
    }
  }

  showStatus(message, isError = false, duration = 0) {
    const statusElement = document.getElementById("status-message")
    if (statusElement) {
      statusElement.textContent = message
      statusElement.className = isError ? "status-error" : ""
      statusElement.classList.remove("status-hidden")

      if (duration > 0) {
        setTimeout(() => this.hideStatus(), duration)
      }
    }
  }

  hideStatus() {
    const statusElement = document.getElementById("status-message")
    if (statusElement) {
      statusElement.classList.add("status-hidden")
    }
  }

  // Process side camera pose data
  processSidePoseData(poseData) {
    // This method can be called by the side camera manager
    // to process pose data from the side view
    console.log("Processing side pose data:", poseData)

    // Here you could implement additional analysis using both
    // main camera and side camera pose data for better accuracy
  }


  // Enable skeleton debug mode
  enableSkeletonDebug() {
    if (this.arRenderer) {
      this.arRenderer.enableDebugMode()
    }
    window.DEBUG_SKELETON = true
    console.log("Skeleton debug mode enabled. Check console for scaling information.")
  }

  // Disable skeleton debug mode
  disableSkeletonDebug() {
    if (this.arRenderer) {
      this.arRenderer.disableDebugMode()
    }
    window.DEBUG_SKELETON = false
    console.log("Skeleton debug mode disabled.")
  }

  // Debug renderer status
  debugRendererStatus() {
    console.log("Renderer Status Debug:")
    console.log("Is Mobile:", this.isMobile)
    console.log("AR Renderer available:", !!this.arRenderer)
    console.log("AR Renderer skeleton visible:", this.arRenderer ? this.arRenderer.showSkeleton : "N/A")
    console.log("ThreeJS Renderer available:", !!this.threejsRenderer)
    console.log("ThreeJS Renderer visible:", this.threejsRenderer ? this.threejsRenderer.skeletonGroup?.visible : "N/A")
    
    return {
      isMobile: this.isMobile,
      arRendererAvailable: !!this.arRenderer,
      arRendererSkeletonVisible: this.arRenderer ? this.arRenderer.showSkeleton : false,
      threejsRendererAvailable: !!this.threejsRenderer,
      threejsRendererVisible: this.threejsRenderer ? this.threejsRenderer.skeletonGroup?.visible : false
    }
  }

  // Mobile detection
  detectMobile() {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
           (window.innerWidth <= 768 && window.innerHeight <= 1024) ||
           ('ontouchstart' in window) ||
           (navigator.maxTouchPoints > 0)
  }

  // Setup mobile-specific features
  setupMobileFeatures() {
    if (!this.isMobile) return

    console.log("Setting up mobile features...")
    
    // Add mobile-specific CSS class
    document.body.classList.add('mobile-device')
    
    // Setup fullscreen functionality
    this.setupFullscreenHandling()
    
    // Setup orientation handling
    this.setupOrientationHandling()
    
    // Setup touch events
    this.setupTouchEvents()
    
    // Auto-enter fullscreen after a short delay
    setTimeout(() => {
      this.enterFullscreen()
    }, 1000)
  }

  // Setup fullscreen handling
  setupFullscreenHandling() {
    // Listen for fullscreen changes
    document.addEventListener('fullscreenchange', () => {
      this.isFullscreen = !!document.fullscreenElement
      console.log('Fullscreen changed:', this.isFullscreen)
      
      if (this.isFullscreen) {
        this.onEnterFullscreen()
      } else {
        this.onExitFullscreen()
      }
    })

    // Listen for fullscreen errors
    document.addEventListener('fullscreenerror', (event) => {
      console.error('Fullscreen error:', event)
      this.showStatus("Could not enter fullscreen mode", true, 3000)
    })
  }

  // Setup orientation handling
  setupOrientationHandling() {
    // Handle orientation changes
    window.addEventListener('orientationchange', () => {
      setTimeout(() => {
        this.handleOrientationChange()
        this.adjustLayoutForMobile()
      }, 500)
    })

    // Handle resize events
    window.addEventListener('resize', () => {
      setTimeout(() => {
        this.adjustLayoutForMobile()
      }, 100)
    })
  }

  // Setup touch events
  setupTouchEvents() {
    // Prevent default touch behaviors that might interfere
    document.addEventListener('touchstart', (e) => {
      // Allow touch events on interactive elements
      if (e.target.closest('.control-btn, .exercise-card, .modal')) {
        return
      }
      // Prevent default for other elements
      e.preventDefault()
    }, { passive: false })

    // Prevent zoom on double tap
    let lastTouchEnd = 0
    document.addEventListener('touchend', (e) => {
      const now = (new Date()).getTime()
      if (now - lastTouchEnd <= 300) {
        e.preventDefault()
      }
      lastTouchEnd = now
    }, false)
  }

  // Enter fullscreen mode
  async enterFullscreen() {
    if (this.isFullscreen) return

    try {
      const element = document.documentElement
      
      if (element.requestFullscreen) {
        await element.requestFullscreen()
      } else if (element.webkitRequestFullscreen) {
        await element.webkitRequestFullscreen()
      } else if (element.mozRequestFullScreen) {
        await element.mozRequestFullScreen()
      } else if (element.msRequestFullscreen) {
        await element.msRequestFullscreen()
      } else {
        console.warn('Fullscreen API not supported')
        return false
      }
      
      this.fullscreenElement = element
      return true
    } catch (error) {
      console.error('Failed to enter fullscreen:', error)
      this.showStatus("Tap to enter fullscreen mode", false, 3000)
      return false
    }
  }

  // Exit fullscreen mode
  async exitFullscreen() {
    if (!this.isFullscreen) return

    try {
      if (document.exitFullscreen) {
        await document.exitFullscreen()
      } else if (document.webkitExitFullscreen) {
        await document.webkitExitFullscreen()
      } else if (document.mozCancelFullScreen) {
        await document.mozCancelFullScreen()
      } else if (document.msExitFullscreen) {
        await document.msExitFullscreen()
      }
    } catch (error) {
      console.error('Failed to exit fullscreen:', error)
    }
  }

  // Handle entering fullscreen
  onEnterFullscreen() {
    console.log('Entered fullscreen mode')
    document.body.classList.add('fullscreen-mode')
    this.adjustLayoutForMobile()
    
    // Hide browser UI elements
    this.hideBrowserUI()
  }

  // Handle exiting fullscreen
  onExitFullscreen() {
    console.log('Exited fullscreen mode')
    document.body.classList.remove('fullscreen-mode')
    this.adjustLayoutForMobile()
    
    // Show browser UI elements
    this.showBrowserUI()
  }

  // Hide browser UI elements
  hideBrowserUI() {
    // Add CSS to hide browser UI
    const style = document.createElement('style')
    style.id = 'hide-browser-ui'
    style.textContent = `
      body.fullscreen-mode {
        position: fixed;
        top: 0;
        left: 0;
        width: 100vw;
        height: 100vh;
        overflow: hidden;
      }
      
      body.fullscreen-mode::-webkit-scrollbar {
        display: none;
      }
    `
    document.head.appendChild(style)
  }

  // Show browser UI elements
  showBrowserUI() {
    const style = document.getElementById('hide-browser-ui')
    if (style) {
      style.remove()
    }
  }

  // Adjust layout for mobile devices
  adjustLayoutForMobile() {
    if (!this.isMobile) return

    console.log('Adjusting layout for mobile...')
    
    // Force landscape orientation
    if (window.innerHeight > window.innerWidth) {
      this.showStatus("Please rotate your device to landscape mode", true, 2000)
    }

    // Adjust component sizes and positions
    this.adjustComponentSizes()
    this.adjustComponentPositions()
  }

  // Adjust component sizes for mobile
  adjustComponentSizes() {
    const isLandscape = window.innerWidth > window.innerHeight
    const isSmallScreen = window.innerWidth < 1024

    if (isSmallScreen) {
      // Make components smaller on small screens
      document.documentElement.style.setProperty('--mobile-scale', '0.8')
      
      // Adjust HUD panels
      const hudPanels = document.querySelectorAll('.hud-panel')
      hudPanels.forEach(panel => {
        panel.style.fontSize = '10px'
        panel.style.padding = '6px'
      })

      // Adjust control buttons
      const controlBtns = document.querySelectorAll('.control-btn')
      controlBtns.forEach(btn => {
        btn.style.padding = '6px 10px'
        btn.style.fontSize = '10px'
      })
    } else {
      // Reset to normal size
      document.documentElement.style.setProperty('--mobile-scale', '1')
    }
  }

  // Adjust component positions for mobile
  adjustComponentPositions() {
    const isLandscape = window.innerWidth > window.innerHeight
    const isSmallScreen = window.innerWidth < 1024
    const isVerySmallScreen = window.innerWidth < 640

    if (isSmallScreen && isLandscape) {
      // Determine panel widths based on screen size - reduced to prevent overlap
      const leftPanelWidth = isVerySmallScreen ? '120px' : (window.innerWidth < 768 ? '140px' : '160px')
      const rightPanelWidth = isVerySmallScreen ? '140px' : (window.innerWidth < 768 ? '160px' : '180px')
      const avatarWidth = isVerySmallScreen ? '200px' : (window.innerWidth < 768 ? '220px' : '240px')
      const leftMargin = isVerySmallScreen ? '140px' : (window.innerWidth < 768 ? '160px' : '180px')
      const rightMargin = isVerySmallScreen ? '160px' : (window.innerWidth < 768 ? '180px' : '200px')
      const cameraWidth = `calc(100% - ${parseInt(leftMargin) + parseInt(rightMargin)}px)`

      // Performance metrics - top left (smaller size)
      const metricsPanel = document.getElementById('metrics-panel')
      if (metricsPanel) {
        metricsPanel.style.top = '20px'
        metricsPanel.style.left = '20px'
        metricsPanel.style.right = 'auto'
        metricsPanel.style.width = leftPanelWidth
        metricsPanel.style.fontSize = '10px'
        metricsPanel.style.padding = '8px'
      }

      // Camera status - below performance metrics on left (smaller size, more spacing)
      const connectionPanel = document.getElementById('connection-panel')
      if (connectionPanel) {
        connectionPanel.style.top = '180px' // Reduced from 200px to prevent overlap
        connectionPanel.style.left = '20px'
        connectionPanel.style.right = 'auto'
        connectionPanel.style.width = leftPanelWidth
        connectionPanel.style.fontSize = '10px'
        connectionPanel.style.padding = '8px'
      }

      // Avatar (side camera) - top right (larger size)
      const sideCameraContainer = document.getElementById('side-camera-container')
      if (sideCameraContainer) {
        sideCameraContainer.style.top = '20px'
        sideCameraContainer.style.right = '20px'
        sideCameraContainer.style.left = 'auto'
        sideCameraContainer.style.width = avatarWidth
        sideCameraContainer.style.height = isVerySmallScreen ? '120px' : (window.innerWidth < 768 ? '150px' : '180px')
      }

      // Posture feedback - bottom right (lowered and smaller)
      const feedbackPanel = document.getElementById('feedback-panel')
      if (feedbackPanel) {
        feedbackPanel.style.top = isVerySmallScreen ? '160px' : (window.innerWidth < 768 ? '190px' : '220px')
        feedbackPanel.style.right = '20px'
        feedbackPanel.style.left = 'auto'
        feedbackPanel.style.width = rightPanelWidth
        feedbackPanel.style.fontSize = '10px'
        feedbackPanel.style.padding = '8px'
      }

      // Adjust camera container to accommodate both left and right panels
      const cameraContainer = document.getElementById('camera-container')
      if (cameraContainer) {
        cameraContainer.style.width = cameraWidth
        cameraContainer.style.marginLeft = leftMargin
        cameraContainer.style.marginRight = rightMargin
      }
      
      // Force resize AR renderer after layout changes
      if (this.arRenderer) {
        setTimeout(() => {
          this.arRenderer.forceResize()
          // Enable debug mode temporarily to help with troubleshooting
          if (window.DEBUG_SKELETON) {
            console.log('Mobile layout adjusted, AR renderer resized')
          }
        }, 100)
      }
    }
  }

  // Toggle fullscreen mode
  async toggleFullscreen() {
    if (this.isFullscreen) {
      await this.exitFullscreen()
    } else {
      await this.enterFullscreen()
    }
  }

  // Cleanup method
  dispose() {
    this.stopWorkout()

    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop())
    }

    if (this.threejsRenderer) {
      this.threejsRenderer.dispose()
    }

    if (this.sideCameraManager) {
      this.sideCameraManager.disconnectSideCamera()
    }

    // Properly disconnect from relay server
    if (this.dummyDataProvider) {
      this.dummyDataProvider.disconnect()
    }

    // Exit fullscreen if active
    if (this.isFullscreen) {
      this.exitFullscreen()
    }
  }
}

// Initialize the app when the page loads
window.addEventListener("DOMContentLoaded", () => {
  window.app = new FitnessARApp()
  
  // Make test functions globally available for debugging
  window.enableSkeletonDebug = () => {
    if (window.app) {
      window.app.enableSkeletonDebug()
    } else {
      console.error("App not initialized yet")
    }
  }

  window.disableSkeletonDebug = () => {
    if (window.app) {
      window.app.disableSkeletonDebug()
    } else {
      console.error("App not initialized yet")
    }
  }

  window.debugRendererStatus = () => {
    if (window.app) {
      return window.app.debugRendererStatus()
    } else {
      console.error("App not initialized yet")
      return null
    }
  }
  
  // Make server command testing available
  window.testServerCommand = (action, payload = {}) => {
    if (window.app && window.app.dummyDataProvider) {
      window.app.dummyDataProvider.handleSystemCommand({ action, ...payload })
    } else {
      console.error("App or data provider not initialized yet")
    }
  }
  
  // Mobile testing functions
  window.testMobileFixes = () => {
    if (window.app) {
      console.log("Testing mobile fixes...")
      
      // Test skeleton debug mode
      window.app.enableSkeletonDebug()
      
      // Test side camera connection
      if (window.app.sideCameraManager) {
        window.app.sideCameraManager.connectSideCamera()
      }
      
      // Test avatar generation
      if (window.app.sideCameraManager) {
        setTimeout(() => {
          window.app.sideCameraManager.testAvatarMovement()
        }, 2000)
      }
      
      console.log("Mobile fixes test initiated. Check console for debug info.")
    } else {
      console.error("App not initialized yet")
    }
  }
  
  // Skeleton alignment test
  window.testSkeletonAlignment = () => {
    if (window.app && window.app.arRenderer) {
      console.log("=== SKELETON ALIGNMENT TEST ===")
      
      // Enable debug mode
      window.app.enableSkeletonDebug()
      
      // Force resize
      window.app.arRenderer.forceResize()
      
      // Get video and canvas info
      const video = document.getElementById('camera-feed')
      const canvas = document.getElementById('ar-overlay')
      
      if (video && canvas) {
        const videoAspect = video.videoWidth / video.videoHeight
        const canvasAspect = canvas.width / canvas.height
        
        console.log("Video:", {
          natural: `${video.videoWidth} x ${video.videoHeight}`,
          aspect: videoAspect.toFixed(3),
          display: `${video.clientWidth} x ${video.clientHeight}`
        })
        
        console.log("Canvas:", {
          internal: `${canvas.width} x ${canvas.height}`,
          aspect: canvasAspect.toFixed(3),
          display: `${canvas.clientWidth} x ${canvas.clientHeight}`
        })
        
        console.log("Transformation:")
        console.log("  1. object-fit: cover -", videoAspect > canvasAspect ? "HEIGHT fills (width cropped)" : "WIDTH fills (height cropped)")
        console.log("  2. transform: scale(1.1) from center")
        
        console.log("\nNext frame will show keypoint transformations...")
      }
      
      console.log("=== END TEST ===")
    } else {
      console.error("App or AR renderer not initialized")
    }
  }
  
  // Draw test markers on skeleton overlay
  window.drawTestMarkers = () => {
    const canvas = document.getElementById('ar-overlay')
    const video = document.getElementById('camera-feed')
    if (!canvas || !video) return
    
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    
    // Clear first
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    
    // Draw center crosshair
    ctx.strokeStyle = '#ff0000'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(canvas.width / 2 - 50, canvas.height / 2)
    ctx.lineTo(canvas.width / 2 + 50, canvas.height / 2)
    ctx.moveTo(canvas.width / 2, canvas.height / 2 - 50)
    ctx.lineTo(canvas.width / 2, canvas.height / 2 + 50)
    ctx.stroke()
    
    // Draw corner markers
    const size = 20
    ctx.strokeStyle = '#ff00ff'
    ctx.strokeRect(0, 0, size, size) // Top-left
    ctx.strokeRect(canvas.width - size, 0, size, size) // Top-right
    ctx.strokeRect(0, canvas.height - size, size, size) // Bottom-left
    ctx.strokeRect(canvas.width - size, canvas.height - size, size, size) // Bottom-right
    
    console.log('Canvas:', {
      size: `${canvas.width} x ${canvas.height}`,
      position: canvas.style.position,
      center: `(${canvas.width/2}, ${canvas.height/2})`
    })
    console.log('Video:', {
      natural: `${video.videoWidth} x ${video.videoHeight}`,
      display: `${video.clientWidth} x ${video.clientHeight}`,
      position: window.getComputedStyle(video).position
    })
    console.log('Window:', {
      size: `${window.innerWidth} x ${window.innerHeight}`
    })
  }
  
  // Quick fix function
  window.fixSkeletonAlignment = () => {
    if (window.app && window.app.arRenderer) {
      console.log('Forcing canvas resize and alignment fix...')
      window.app.arRenderer.forceResize()
      window.app.enableSkeletonDebug()
      console.log('Canvas should now be aligned. Check skeleton in next frame.')
    } else {
      console.error('App not initialized')
    }
  }
})

// Handle page unload
window.addEventListener("beforeunload", () => {
  if (window.app) {
    window.app.dispose()
  }
})

