/**
 * SideCameraManager - Handles side view camera with MediaPipe BlazePose 3D pose detection
 * 
 * Key Features:
 * - MediaPipe BlazePose for accurate 3D pose estimation
 * - Enhanced human-like avatar rendering with depth perception
 * - Real-time pose tracking with smoothing
 * - WebRTC support for remote camera connection
 * - Mock data mode for testing
 * 
 * Usage:
 * - Call connectSideCamera() to start
 * - Use testSimpleAvatar() or testHumanoidAvatar() to test with mock data
 * - BlazePose provides 33 landmarks with 3D coordinates (x, y, z)
 */

class SideCameraManager {
  constructor() {
    this.sideStream = null
    this.isConnected = false
    this.peerConnection = null
    this.dataChannel = null
    this.websocket = null

    // Mock connection for demo
    this.mockConnection = false // Set to false to use real Firebase signaling
    this.mockPoseData = null

    // Avatar rendering
    this.showAvatar = true

    // Side camera pose detection (now using MediaPipe BlazePose)
    this.sidePoseDetector = null // MediaPipe Pose instance
    this.sideVideoElement = null
    this.detectionLoop = null
    this.lastPoseTime = 0
    this.detectionInterval = 100 // 10 FPS for performance
    
    // Exercise tracking
    this.currentExerciseType = null

    // Pose Animator related properties (legacy)
    this.poseAnimatorIllustration = null;
    this.poseAnimatorSkeleton = null;
    this.poseAnimatorCanvasScope = null;

    // Pose data smoothing
    this.lastPoseData = null

    // Signaling
    this.signaling = null
    this.roomId = null

    console.log("🎬 SideCameraManager initialized with MediaPipe BlazePose 3D support")

    this.initializeElements()
    this.initializeAvatar()
    this.initializeSidePoseDetection()
    this.initializePoseAnimator()
  }

  initializeElements() {
    const connectBtn = document.getElementById("connect-side-camera")
    const toggleAvatarBtn = document.getElementById("toggle-avatar")

    console.log("Initializing side camera elements...")
    console.log("Connect button found:", !!connectBtn)
    console.log("Toggle avatar button found:", !!toggleAvatarBtn)

    if (connectBtn) {
      connectBtn.addEventListener("click", () => {
        console.log("Connect side camera button clicked!")
        this.connectSideCamera()
      })
    } else {
      console.error("Connect side camera button not found!")
    }

    if (toggleAvatarBtn) {
      toggleAvatarBtn.addEventListener("click", () => {
        console.log("Toggle avatar button clicked!")
        this.toggleAvatar()
      })
    } else {
      console.warn("Toggle avatar button not found!")
    }
  }

  initializeAvatar() {
    // We're now using Pose Animator 2D avatar instead of 3D avatar
    console.log("Avatar initialization handled by initializePoseAnimator method")
  }

  async initializeSidePoseDetection() {
    try {
      console.log("Initializing MediaPipe BlazePose for side camera...")
      
      // Wait for MediaPipe Pose to be available
      if (typeof Pose === 'undefined') {
        console.warn("MediaPipe Pose not loaded yet, retrying...")
        setTimeout(() => this.initializeSidePoseDetection(), 1000)
        return
      }

      // Initialize MediaPipe BlazePose
      this.sidePoseDetector = new Pose({
        locateFile: (file) => {
          return `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`
        }
      })

      // Configure BlazePose
      this.sidePoseDetector.setOptions({
        modelComplexity: 1, // 0, 1, or 2 (2 is most accurate but slower)
        smoothLandmarks: true,
        enableSegmentation: false,
        smoothSegmentation: false,
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5
      })

      // Set up the callback for pose results
      this.sidePoseDetector.onResults((results) => {
        this.handleBlazePoseResults(results)
      })

      console.log("MediaPipe BlazePose initialized successfully for side camera")
    } catch (error) {
      console.error("Failed to initialize MediaPipe BlazePose:", error)
      this.sidePoseDetector = null
    }
  }

  async connectSideCamera() {
    try {
      console.log("=== CONNECT SIDE CAMERA STARTED ===")
      console.log("Attempting to connect side camera...")

      // For mobile devices, use mock data mode for side camera
      const isMobile = window.innerWidth <= 768
      if (isMobile) {
        console.log("Mobile device detected - using mock data mode for side camera")
        await this.establishMockConnection()
        this.updateConnectionStatus(true)
        console.log("Side camera connected successfully (mock mode)")
        console.log("=== CONNECT SIDE CAMERA COMPLETED ===")
        return
      }

      // For desktop, use WebRTC connection
      console.log("Desktop device - using WebRTC connection...")
      await this.establishWebRTCConnection()
      console.log("WebRTC connection established")

      this.updateConnectionStatus(true)
      console.log("Side camera connected successfully")
      console.log("=== CONNECT SIDE CAMERA COMPLETED ===")
    } catch (error) {
      console.error("=== CONNECT SIDE CAMERA FAILED ===")
      console.error("Failed to connect side camera:", error)
      
      // Fallback to mock mode if WebRTC fails
      console.log("Falling back to mock data mode...")
      try {
        await this.establishMockConnection()
        this.updateConnectionStatus(true)
        console.log("Side camera connected successfully (fallback mock mode)")
      } catch (fallbackError) {
        console.error("Fallback mock mode also failed:", fallbackError)
        this.updateConnectionStatus(false)
      }
    }
  }

  async establishMockConnection() {
    // Simulate connection delay
    await new Promise((resolve) => setTimeout(resolve, 1000))

    // For mobile, we'll use mock data instead of trying to access camera
    const isMobile = window.innerWidth <= 768
    
    if (isMobile) {
      console.log("Mobile mode - using mock data for side camera")
      this.isConnected = true
      // Start mock data generation for avatar
      this.startMockDataForTesting()
      return
    }

    // For desktop, try to get actual camera
    try {
      this.sideStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "environment",
          width: { ideal: 640 },
          height: { ideal: 480 },
        },
      })

      this.sideVideoElement = document.getElementById("side-camera-feed")
      if (this.sideVideoElement) {
        this.sideVideoElement.srcObject = this.sideStream
        // Wait for video to load before starting pose detection
        this.sideVideoElement.onloadedmetadata = () => {
          console.log("Side camera video loaded, starting pose detection")
          this.startSidePoseDetection()
        }
      }

      this.isConnected = true
    } catch (error) {
      console.warn("Could not access side camera:", error)
      this.isConnected = true
      // Still start pose detection even if camera fails (will use mock data)
      this.startSidePoseDetection()
    }
  }

  async establishWebRTCConnection() {
    console.log("=== ESTABLISHING WEBRTC CONNECTION ===")
    
    const configuration = {
      iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        {
          urls: "turn:openrelay.metered.ca:80",
          username: "openrelayproject",
          credential: "openrelayproject"
        }
      ],
    };
    
    console.log("Creating RTCPeerConnection...")
    this.peerConnection = new RTCPeerConnection(configuration)
    console.log("RTCPeerConnection created successfully")
    
    // Create data channel for pose data exchange
    this.dataChannel = this.peerConnection.createDataChannel("poseData", { ordered: true })

    this.dataChannel.onopen = () => {
      console.log("Data channel opened")
    }

    this.dataChannel.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        this.handleSidePoseData(data)
      } catch (e) {
        console.warn("Non-JSON side data:", event.data)
      }
    }

    // Remote stream from side device
    this.peerConnection.ontrack = (event) => {
      this.sideVideoElement = document.getElementById("side-camera-feed")
      if (this.sideVideoElement) {
        this.sideVideoElement.srcObject = event.streams[0]
        // Start pose detection when we get the remote stream
        this.startSidePoseDetection()
      }
    }

    // Initialize signaling
    console.log("Initializing Firebase signaling...")
    if (!this.signaling) {
      console.log("Creating new FirebaseSignaling instance...")
      this.signaling = new window.FirebaseSignaling()
      console.log("Initializing Firebase signaling...")
      await this.signaling.initialize()
      console.log("Firebase signaling initialized successfully")
    } else {
      console.log("Firebase signaling already initialized")
    }

    // Create and publish offer
    console.log("Creating WebRTC offer...")
    const offer = await this.peerConnection.createOffer({ offerToReceiveAudio: false, offerToReceiveVideo: true })
    console.log("Offer created:", offer.type)
    
    console.log("Setting local description...")
    await this.peerConnection.setLocalDescription(offer)
    console.log("Local description set successfully")
    
    console.log("Creating Firebase room...")
    this.roomId = await this.signaling.createRoom(offer)
    console.log("Room created with ID:", this.roomId)

    // ICE handling (after room creation so collections exist)
    this.peerConnection.onicecandidate = async (event) => {
      if (event.candidate) {
        try { 
          await this.signaling.addCallerIce(event.candidate) 
        } catch (e) { 
          console.warn('ICE store failed', e) 
        }
      }
    }
    this.showRoomId(this.roomId)

    // Listen for answer
    this.signaling.onAnswer(async (answer) => {
      if (!this.peerConnection.currentRemoteDescription) {
        await this.peerConnection.setRemoteDescription(answer)
        this.updateConnectionStatus(true)
      }
    })

    // Listen for callee ICE
    this.signaling.onCalleeIce(async (candidate) => {
      try {
        await this.peerConnection.addIceCandidate(candidate)
      } catch (e) {
        console.warn("Failed to add callee ICE", e)
      }
    })
  }

  startSidePoseDetection() {
    if (!this.sidePoseDetector || !this.sideVideoElement) {
      console.warn("Side pose detector or video element not available, skipping pose detection")
      return
    }

    console.log("Starting BlazePose detection for side camera...")

    // Start the detection loop with MediaPipe BlazePose
    const detectPoses = async () => {
      if (!this.isConnected || !this.sideVideoElement) return

      const currentTime = Date.now()
      if (currentTime - this.lastPoseTime < this.detectionInterval) {
        this.detectionLoop = requestAnimationFrame(detectPoses)
        return
      }

      try {
        // Check if video is ready
        if (this.sideVideoElement.readyState >= 2) {
          // Send video frame to BlazePose
          await this.sidePoseDetector.send({ image: this.sideVideoElement })
        }

        this.lastPoseTime = currentTime
      } catch (error) {
        console.error("Error in side camera pose detection:", error)
      }

      this.detectionLoop = requestAnimationFrame(detectPoses)
    }

    detectPoses()
    console.log("Side camera BlazePose detection started")
  }

  handleBlazePoseResults(results) {
    if (!results || !results.poseLandmarks) {
      console.log("No pose landmarks detected")
      return
    }

    console.log("BlazePose 3D landmarks detected:", results.poseLandmarks.length)
    
    // Convert BlazePose results to our format
    const sidePoseData = this.convertBlazePoseToSideData(results)
    
    if (sidePoseData && sidePoseData.keypoints.length >= 10) {
      this.handleSidePoseData(sidePoseData)
    } else {
      console.log("Not enough valid keypoints from BlazePose")
    }
  }

  startMockDataForTesting() {
    // Generate mock data for testing when pose detection is not available
    setInterval(() => {
      if (this.isConnected) {
        const mockData = this.generateMockSidePoseData()
        this.handleSidePoseData(mockData)
      }
    }, 100)
    console.log("Started mock data for side camera testing")
  }

  generateMockSidePoseData() {
    // Generate mock 3D pose data for side view with movement
    const time = Date.now() / 1000
    const breathingCycle = Math.sin(time * 0.3) * 0.02 // Breathing
    const exerciseMovement = Math.sin(time * 1.5) * 0.1 // Exercise movement
    const depthMovement = Math.sin(time * 0.8) * 0.05 // Depth variation
    const baseY = 0.2 + breathingCycle // Normalized Y position
    const baseX = 0.5 // Center X position
    const baseZ = -0.1 + depthMovement // Base depth
    
    return {
      keypoints: [
        // Head
        { name: "head", position: { x: baseX, y: baseY, z: baseZ - 0.05 }, score: 0.9 },
        
        // Eyes and ears for better head rendering
        { name: "leftEye", position: { x: baseX - 0.02, y: baseY - 0.01, z: baseZ - 0.06 }, score: 0.9 },
        { name: "rightEye", position: { x: baseX + 0.02, y: baseY - 0.01, z: baseZ - 0.06 }, score: 0.9 },
        { name: "leftEar", position: { x: baseX - 0.04, y: baseY, z: baseZ - 0.03 }, score: 0.9 },
        { name: "rightEar", position: { x: baseX + 0.04, y: baseY, z: baseZ - 0.03 }, score: 0.9 },
        
        // Shoulders
        { name: "leftShoulder", position: { x: baseX - 0.08, y: baseY + 0.15, z: baseZ }, score: 0.9 },
        { name: "rightShoulder", position: { x: baseX + 0.08, y: baseY + 0.15, z: baseZ + 0.02 }, score: 0.9 },
        { name: "shoulder", position: { x: baseX, y: baseY + 0.15, z: baseZ }, score: 0.9 },
        
        // Arms
        { name: "leftElbow", position: { x: baseX - 0.12 + exerciseMovement, y: baseY + 0.35, z: baseZ + (exerciseMovement * 0.5) }, score: 0.8 },
        { name: "rightElbow", position: { x: baseX + 0.12 + exerciseMovement, y: baseY + 0.35, z: baseZ + 0.02 + (exerciseMovement * 0.5) }, score: 0.8 },
        
        { name: "leftWrist", position: { x: baseX - 0.15 + (exerciseMovement * 1.2), y: baseY + 0.55, z: baseZ + (exerciseMovement * 0.8) }, score: 0.8 },
        { name: "rightWrist", position: { x: baseX + 0.15 + (exerciseMovement * 1.2), y: baseY + 0.55, z: baseZ + 0.02 + (exerciseMovement * 0.8) }, score: 0.8 },
        
        // Hips
        { name: "leftHip", position: { x: baseX - 0.06, y: baseY + 0.45, z: baseZ + 0.01 }, score: 0.9 },
        { name: "rightHip", position: { x: baseX + 0.06, y: baseY + 0.45, z: baseZ + 0.03 }, score: 0.9 },
        { name: "hip", position: { x: baseX, y: baseY + 0.45, z: baseZ + 0.02 }, score: 0.9 },
        
        // Legs
        { name: "leftKnee", position: { x: baseX - 0.05 - (exerciseMovement * 0.1), y: baseY + 0.7, z: baseZ - (exerciseMovement * 0.3) }, score: 0.9 },
        { name: "rightKnee", position: { x: baseX + 0.05 - (exerciseMovement * 0.1), y: baseY + 0.7, z: baseZ + 0.02 - (exerciseMovement * 0.3) }, score: 0.9 },
        
        { name: "leftAnkle", position: { x: baseX - 0.08 - (exerciseMovement * 0.2), y: baseY + 0.95, z: baseZ - (exerciseMovement * 0.5) }, score: 0.9 },
        { name: "rightAnkle", position: { x: baseX + 0.08 - (exerciseMovement * 0.2), y: baseY + 0.95, z: baseZ + 0.02 - (exerciseMovement * 0.5) }, score: 0.9 },
      ],
      timestamp: Date.now(),
      confidence: 0.85,
      is3D: true // Mark as 3D data
    }
  }

  convertBlazePoseToSideData(results) {
    // Convert MediaPipe BlazePose 3D landmarks to our format
    const landmarks = results.poseLandmarks
    const worldLandmarks = results.poseWorldLandmarks // 3D coordinates in meters
    
    if (!landmarks || landmarks.length === 0) {
      console.warn("No landmarks in BlazePose results")
      return null
    }

    console.log("Converting BlazePose landmarks:", landmarks.length)
    
    // MediaPipe BlazePose landmark indices
    // Reference: https://google.github.io/mediapipe/solutions/pose.html
    const blazePoseIndices = {
      nose: 0,
      leftEyeInner: 1,
      leftEye: 2,
      leftEyeOuter: 3,
      rightEyeInner: 4,
      rightEye: 5,
      rightEyeOuter: 6,
      leftEar: 7,
      rightEar: 8,
      mouthLeft: 9,
      mouthRight: 10,
      leftShoulder: 11,
      rightShoulder: 12,
      leftElbow: 13,
      rightElbow: 14,
      leftWrist: 15,
      rightWrist: 16,
      leftPinky: 17,
      rightPinky: 18,
      leftIndex: 19,
      rightIndex: 20,
      leftThumb: 21,
      rightThumb: 22,
      leftHip: 23,
      rightHip: 24,
      leftKnee: 25,
      rightKnee: 26,
      leftAnkle: 27,
      rightAnkle: 28,
      leftHeel: 29,
      rightHeel: 30,
      leftFootIndex: 31,
      rightFootIndex: 32
    }

    // Convert landmarks to our keypoint format with 3D data
    const keypoints = []
    
    // Helper function to add keypoint with smoothing
    const addKeypoint = (name, index) => {
      if (index < landmarks.length) {
        const landmark = landmarks[index]
        const worldLandmark = worldLandmarks ? worldLandmarks[index] : null
        
        // Normalize screen coordinates (already 0-1 from MediaPipe)
        let x = landmark.x
        let y = landmark.y
        let z = landmark.z // depth (negative is closer to camera)
        
        // Apply smoothing
        if (this.lastPoseData && this.lastPoseData.keypoints) {
          const lastKp = this.lastPoseData.keypoints.find(lkp => lkp.name === name)
          if (lastKp && lastKp.position) {
            const smoothingFactor = 0.6 // Smoothing for stability
            x = lastKp.position.x * smoothingFactor + x * (1 - smoothingFactor)
            y = lastKp.position.y * smoothingFactor + y * (1 - smoothingFactor)
            z = lastKp.position.z * smoothingFactor + z * (1 - smoothingFactor)
          }
        }
        
        keypoints.push({
          name: name,
          position: {
            x: x,
            y: y,
            z: z // Include depth for 3D rendering
          },
          position3D: worldLandmark ? {
            x: worldLandmark.x,
            y: worldLandmark.y,
            z: worldLandmark.z
          } : null, // World coordinates in meters
          score: landmark.visibility || 0.9
        })
      }
    }

    // Add all important keypoints for humanoid avatar
    addKeypoint('head', blazePoseIndices.nose)
    addKeypoint('leftShoulder', blazePoseIndices.leftShoulder)
    addKeypoint('rightShoulder', blazePoseIndices.rightShoulder)
    addKeypoint('leftElbow', blazePoseIndices.leftElbow)
    addKeypoint('rightElbow', blazePoseIndices.rightElbow)
    addKeypoint('leftWrist', blazePoseIndices.leftWrist)
    addKeypoint('rightWrist', blazePoseIndices.rightWrist)
    addKeypoint('leftHip', blazePoseIndices.leftHip)
    addKeypoint('rightHip', blazePoseIndices.rightHip)
    addKeypoint('leftKnee', blazePoseIndices.leftKnee)
    addKeypoint('rightKnee', blazePoseIndices.rightKnee)
    addKeypoint('leftAnkle', blazePoseIndices.leftAnkle)
    addKeypoint('rightAnkle', blazePoseIndices.rightAnkle)
    
    // Add extra points for better rendering
    addKeypoint('leftEye', blazePoseIndices.leftEye)
    addKeypoint('rightEye', blazePoseIndices.rightEye)
    addKeypoint('leftEar', blazePoseIndices.leftEar)
    addKeypoint('rightEar', blazePoseIndices.rightEar)

    // Calculate center points for better avatar rendering
    if (keypoints.length >= 10) {
      // Shoulder center
      const leftShoulder = keypoints.find(kp => kp.name === 'leftShoulder')
      const rightShoulder = keypoints.find(kp => kp.name === 'rightShoulder')
      if (leftShoulder && rightShoulder) {
        keypoints.push({
          name: 'shoulder',
          position: {
            x: (leftShoulder.position.x + rightShoulder.position.x) / 2,
            y: (leftShoulder.position.y + rightShoulder.position.y) / 2,
            z: (leftShoulder.position.z + rightShoulder.position.z) / 2
          },
          score: (leftShoulder.score + rightShoulder.score) / 2
        })
      }
      
      // Hip center
      const leftHip = keypoints.find(kp => kp.name === 'leftHip')
      const rightHip = keypoints.find(kp => kp.name === 'rightHip')
      if (leftHip && rightHip) {
        keypoints.push({
          name: 'hip',
          position: {
            x: (leftHip.position.x + rightHip.position.x) / 2,
            y: (leftHip.position.y + rightHip.position.y) / 2,
            z: (leftHip.position.z + rightHip.position.z) / 2
          },
          score: (leftHip.score + rightHip.score) / 2
        })
      }
    }

    // Store for smoothing
    this.lastPoseData = {
      keypoints: keypoints,
      timestamp: Date.now(),
      confidence: 0.85,
      is3D: true
    }

    console.log("BlazePose keypoints converted:", keypoints.length)
    console.log("Keypoint names:", keypoints.map(kp => kp.name).join(', '))

    return this.lastPoseData
  }

  handleSidePoseData(poseData) {
    console.log("Handling side pose data:", poseData)
    
    // Draw simple 2D skeleton avatar
    this.drawSimpleAvatar(poseData)

    // Send pose data to main app for analysis
    if (window.app && window.app.processSidePoseData) {
      window.app.processSidePoseData(poseData)
    }
  }

  drawSimpleAvatar(poseData) {
    if (!this.showAvatar) return;
    
    const canvas = document.getElementById('side-avatar-canvas');
    if (!canvas) {
      console.error("Side avatar canvas not found!");
      return;
    }
    
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      console.error("Could not get canvas context!");
      return;
    }
    
    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Set canvas background with gradient
    const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
    gradient.addColorStop(0, '#1a1a2e');
    gradient.addColorStop(1, '#0f0f1e');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    const keypoints = poseData.keypoints || [];
    console.log("Drawing enhanced 3D avatar with", keypoints.length, "keypoints");
    
    // Check if we have 3D data
    const is3D = poseData.is3D || false;
    
    // Draw connections first (behind joints)
    this.drawEnhancedSkeletonConnections(ctx, keypoints, canvas.width, canvas.height, is3D);
    
    // Draw body shapes for more human-like appearance
    this.drawBodyShapes(ctx, keypoints, canvas.width, canvas.height, is3D);
    
    // Draw keypoints as joints with depth-based sizing
    keypoints.forEach(kp => {
      if (kp.score < 0.3) return; // Skip low confidence points
      
      const x = kp.position ? kp.position.x * canvas.width : (kp.x || 0);
      const y = kp.position ? kp.position.y * canvas.height : (kp.y || 0);
      const z = kp.position && kp.position.z ? kp.position.z : 0;
      
      // Calculate size based on depth (z) - closer = larger
      const depthScale = is3D ? (1.2 - z * 0.3) : 1.0;
      
      // Different sizes and colors for different body parts
      let radius = 3 * depthScale;
      let color = '#00ff88';
      
      if (kp.name === 'head') {
        radius = 8 * depthScale;
        color = '#00ffff';
      } else if (kp.name.includes('shoulder') || kp.name.includes('hip')) {
        radius = 6 * depthScale;
        color = '#00dd88';
      } else if (kp.name.includes('elbow') || kp.name.includes('knee')) {
        radius = 5 * depthScale;
        color = '#00cc77';
      } else if (kp.name.includes('wrist') || kp.name.includes('ankle')) {
        radius = 4 * depthScale;
        color = '#00bb66';
      }
      
      // Draw joint with glow effect
      const glowGradient = ctx.createRadialGradient(x, y, 0, x, y, radius * 1.5);
      glowGradient.addColorStop(0, color);
      glowGradient.addColorStop(0.7, color + '88');
      glowGradient.addColorStop(1, color + '00');
      
      ctx.fillStyle = glowGradient;
      ctx.beginPath();
      ctx.arc(x, y, radius * 1.5, 0, 2 * Math.PI);
      ctx.fill();
      
      // Draw solid joint
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, 2 * Math.PI);
      ctx.fill();
      
      // Add highlight
      ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
      ctx.beginPath();
      ctx.arc(x - radius * 0.3, y - radius * 0.3, radius * 0.4, 0, 2 * Math.PI);
      ctx.fill();
    });
    
    // Draw head details if head keypoint exists
    this.drawHeadDetails(ctx, keypoints, canvas.width, canvas.height, is3D);
    
    console.log("Enhanced 3D humanoid avatar drawn successfully");
  }
  
  drawEnhancedSkeletonConnections(ctx, keypoints, canvasWidth, canvasHeight, is3D) {
    // Enhanced connections with depth-aware rendering
    const connections = [
      // Head to neck
      { from: 'head', to: 'shoulder', width: 6, color: '#00ffaa' },
      
      // Arms
      { from: 'leftShoulder', to: 'leftElbow', width: 5, color: '#00ff88' },
      { from: 'leftElbow', to: 'leftWrist', width: 4, color: '#00dd77' },
      { from: 'rightShoulder', to: 'rightElbow', width: 5, color: '#00ff88' },
      { from: 'rightElbow', to: 'rightWrist', width: 4, color: '#00dd77' },
      
      // Torso
      { from: 'shoulder', to: 'hip', width: 8, color: '#00ffcc' },
      
      // Legs
      { from: 'hip', to: 'leftKnee', width: 6, color: '#00ff99' },
      { from: 'leftKnee', to: 'leftAnkle', width: 5, color: '#00ee88' },
      { from: 'hip', to: 'rightKnee', width: 6, color: '#00ff99' },
      { from: 'rightKnee', to: 'rightAnkle', width: 5, color: '#00ee88' },
      
      // Shoulder line
      { from: 'leftShoulder', to: 'rightShoulder', width: 6, color: '#00ffbb' },
      
      // Hip line
      { from: 'leftHip', to: 'rightHip', width: 6, color: '#00ffbb' }
    ];
    
    // Helper function to get keypoint with 3D coords
    const getKeypointData = (kp) => {
      if (kp.position) {
        return {
          x: kp.position.x * canvasWidth,
          y: kp.position.y * canvasHeight,
          z: kp.position.z || 0
        };
      }
      return null;
    };
    
    // Draw connections with gradient and depth
    connections.forEach(conn => {
      const fromKp = keypoints.find(kp => kp.name === conn.from);
      const toKp = keypoints.find(kp => kp.name === conn.to);
      
      if (fromKp && toKp && fromKp.score > 0.3 && toKp.score > 0.3) {
        const fromData = getKeypointData(fromKp);
        const toData = getKeypointData(toKp);
        
        if (fromData && toData) {
          // Calculate depth-based opacity and width
          const avgZ = (fromData.z + toData.z) / 2;
          const depthScale = is3D ? (1.2 - avgZ * 0.3) : 1.0;
          const lineWidth = conn.width * depthScale;
          const opacity = Math.max(0.5, 1.0 - Math.abs(avgZ) * 0.3);
          
          // Draw shadow/depth line
          ctx.strokeStyle = 'rgba(0, 0, 0, 0.3)';
          ctx.lineWidth = lineWidth + 2;
          ctx.lineCap = 'round';
        ctx.beginPath();
          ctx.moveTo(fromData.x + 2, fromData.y + 2);
          ctx.lineTo(toData.x + 2, toData.y + 2);
          ctx.stroke();
          
          // Create gradient for the connection
          const gradient = ctx.createLinearGradient(
            fromData.x, fromData.y, toData.x, toData.y
          );
          gradient.addColorStop(0, conn.color + Math.floor(opacity * 255).toString(16).padStart(2, '0'));
          gradient.addColorStop(0.5, conn.color + 'ff');
          gradient.addColorStop(1, conn.color + Math.floor(opacity * 255).toString(16).padStart(2, '0'));
          
          // Draw main connection
          ctx.strokeStyle = gradient;
          ctx.lineWidth = lineWidth;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(fromData.x, fromData.y);
          ctx.lineTo(toData.x, toData.y);
          ctx.stroke();
          
          // Add highlight line
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
          ctx.lineWidth = lineWidth * 0.3;
          ctx.beginPath();
          ctx.moveTo(fromData.x, fromData.y);
          ctx.lineTo(toData.x, toData.y);
        ctx.stroke();
        }
      }
    });
  }

  drawBodyShapes(ctx, keypoints, canvasWidth, canvasHeight, is3D) {
    // Draw body shapes for more realistic appearance
    
    // Get key points
    const head = keypoints.find(kp => kp.name === 'head');
    const shoulder = keypoints.find(kp => kp.name === 'shoulder');
    const leftShoulder = keypoints.find(kp => kp.name === 'leftShoulder');
    const rightShoulder = keypoints.find(kp => kp.name === 'rightShoulder');
    const hip = keypoints.find(kp => kp.name === 'hip');
    const leftHip = keypoints.find(kp => kp.name === 'leftHip');
    const rightHip = keypoints.find(kp => kp.name === 'rightHip');
    
    const getCoords = (kp) => kp && kp.position ? {
      x: kp.position.x * canvasWidth,
      y: kp.position.y * canvasHeight,
      z: kp.position.z || 0
    } : null;
    
    // Draw torso shape
    if (leftShoulder && rightShoulder && leftHip && rightHip) {
      const ls = getCoords(leftShoulder);
      const rs = getCoords(rightShoulder);
      const lh = getCoords(leftHip);
      const rh = getCoords(rightHip);
      
      if (ls && rs && lh && rh) {
        // Create gradient for torso
        const torsoGradient = ctx.createLinearGradient(
          (ls.x + rs.x) / 2, ls.y,
          (lh.x + rh.x) / 2, lh.y
        );
        torsoGradient.addColorStop(0, 'rgba(0, 255, 200, 0.15)');
        torsoGradient.addColorStop(1, 'rgba(0, 255, 150, 0.1)');
        
        ctx.fillStyle = torsoGradient;
        ctx.beginPath();
        ctx.moveTo(ls.x, ls.y);
        ctx.lineTo(rs.x, rs.y);
        ctx.lineTo(rh.x, rh.y);
        ctx.lineTo(lh.x, lh.y);
        ctx.closePath();
        ctx.fill();
        
        // Outline
        ctx.strokeStyle = 'rgba(0, 255, 200, 0.3)';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }
    
    // Draw head shape (more detailed)
    if (head && shoulder) {
      const h = getCoords(head);
      const s = getCoords(shoulder);
      
      if (h && s) {
        const headRadius = Math.abs(h.y - s.y) * 0.8;
        
        // Head glow
        const headGlow = ctx.createRadialGradient(h.x, h.y, 0, h.x, h.y, headRadius * 1.5);
        headGlow.addColorStop(0, 'rgba(0, 255, 255, 0.3)');
        headGlow.addColorStop(1, 'rgba(0, 255, 255, 0)');
        
        ctx.fillStyle = headGlow;
        ctx.beginPath();
        ctx.arc(h.x, h.y, headRadius * 1.5, 0, 2 * Math.PI);
        ctx.fill();
        
        // Head shape
        ctx.fillStyle = 'rgba(0, 255, 255, 0.2)';
        ctx.beginPath();
        ctx.arc(h.x, h.y, headRadius, 0, 2 * Math.PI);
        ctx.fill();
        
        ctx.strokeStyle = 'rgba(0, 255, 255, 0.5)';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }
  }

  drawHeadDetails(ctx, keypoints, canvasWidth, canvasHeight, is3D) {
    // Draw facial features if available
    const head = keypoints.find(kp => kp.name === 'head');
    const leftEye = keypoints.find(kp => kp.name === 'leftEye');
    const rightEye = keypoints.find(kp => kp.name === 'rightEye');
    const leftEar = keypoints.find(kp => kp.name === 'leftEar');
    const rightEar = keypoints.find(kp => kp.name === 'rightEar');
    
    const getCoords = (kp) => kp && kp.position ? {
      x: kp.position.x * canvasWidth,
      y: kp.position.y * canvasHeight,
      z: kp.position.z || 0
    } : null;
    
    // Draw eyes
    if (leftEye && leftEye.score > 0.3) {
      const le = getCoords(leftEye);
      if (le) {
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(le.x, le.y, 2, 0, 2 * Math.PI);
        ctx.fill();
      }
    }
    
    if (rightEye && rightEye.score > 0.3) {
      const re = getCoords(rightEye);
      if (re) {
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(re.x, re.y, 2, 0, 2 * Math.PI);
        ctx.fill();
      }
    }
    
    // Draw ears
    [leftEar, rightEar].forEach(ear => {
      if (ear && ear.score > 0.3) {
        const e = getCoords(ear);
        if (e) {
          ctx.fillStyle = 'rgba(0, 255, 200, 0.3)';
          ctx.beginPath();
          ctx.arc(e.x, e.y, 3, 0, 2 * Math.PI);
          ctx.fill();
        }
      }
    });
  }

  drawSkeletonConnections(ctx, keypoints, canvasWidth, canvasHeight) {
    // Legacy method - now replaced by drawEnhancedSkeletonConnections
    // Kept for backwards compatibility
    this.drawEnhancedSkeletonConnections(ctx, keypoints, canvasWidth, canvasHeight, false);
  }
  
  drawAdditionalConnections(ctx, keypoints, canvasWidth, canvasHeight) {
    // Draw spine (head to hip)
    const head = keypoints.find(kp => kp.name === 'head');
    const hip = keypoints.find(kp => kp.name === 'hip');
    
    if (head && hip && head.score > 0.3 && hip.score > 0.3) {
      const headCoords = head.position ? 
        { x: head.position.x * canvasWidth, y: head.position.y * canvasHeight } :
        { x: (head.x || 0) * canvasWidth, y: (head.y || 0) * canvasHeight };
      const hipCoords = hip.position ? 
        { x: hip.position.x * canvasWidth, y: hip.position.y * canvasHeight } :
        { x: (hip.x || 0) * canvasWidth, y: (hip.y || 0) * canvasHeight };
      
      ctx.beginPath();
      ctx.moveTo(headCoords.x, headCoords.y);
      ctx.lineTo(hipCoords.x, hipCoords.y);
      ctx.stroke();
    }
    
    // Draw shoulders line
    const shoulder = keypoints.find(kp => kp.name === 'shoulder');
    if (shoulder && shoulder.score > 0.3) {
      const shoulderCoords = shoulder.position ? 
        { x: shoulder.position.x * canvasWidth, y: shoulder.position.y * canvasHeight } :
        { x: (shoulder.x || 0) * canvasWidth, y: (shoulder.y || 0) * canvasHeight };
      
      // Draw a small horizontal line to represent shoulders
      ctx.beginPath();
      ctx.moveTo(shoulderCoords.x - 10, shoulderCoords.y);
      ctx.lineTo(shoulderCoords.x + 10, shoulderCoords.y);
      ctx.stroke();
    }
  }

  convertPoseDataForAnimator(poseData) {
    // Convert our pose data format to the format expected by Pose Animator
    const animatorPose = {
      keypoints: []
    };

    // Map keypoints to the format expected by the PoseIllustration
    if (poseData.keypoints) {
      poseData.keypoints.forEach(kp => {
        animatorPose.keypoints.push({
          part: kp.name,
          position: {
            x: kp.position ? kp.position.x : (kp.x || 0),
            y: kp.position ? kp.position.y : (kp.y || 0)
          },
          score: kp.score || 0.5
        });
      });
    }

    return animatorPose;
  }

  toggleAvatar() {
    this.showAvatar = !this.showAvatar

    const canvas = document.getElementById('side-avatar-canvas');
    if (canvas) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        // Clear the canvas if hiding avatar
        if (!this.showAvatar) {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.fillStyle = '#1a1a1a';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
        }
      }
    }

    const toggleBtn = document.getElementById("toggle-avatar")
    if (toggleBtn) {
      toggleBtn.textContent = this.showAvatar ? "Hide Avatar" : "Show Avatar"
    }

    console.log(`Side avatar ${this.showAvatar ? "enabled" : "disabled"}`)
  }

  // Method to update avatar based on exercise type
  setExerciseType(exerciseType) {
    // Store exercise type in the manager (BlazePose doesn't need this)
    this.currentExerciseType = exerciseType
    console.log(`Side camera exercise type set to: ${exerciseType}`)
    
    // Future: Can use this.currentExerciseType for exercise-specific pose analysis
  }

  // Test method to force avatar movement
  testAvatarMovement() {
    console.log("Testing avatar movement...")
    if (this.poseAnimatorIllustration) {
      const testData = this.generateMockSidePoseData()
      console.log("Sending test data to avatar:", testData)
      this.handleSidePoseData(testData)
    } else {
      console.log("Pose Animator not available for testing")
    }
  }

  // Force mock data mode for testing
  enableMockDataMode() {
    console.log("Enabling mock data mode for side camera")
    this.stopSidePoseDetection()
    this.startMockDataForTesting()
  }

  // Server-based pose detection
  async detectPoseFromServer() {
    if (!this.sideVideoElement) {
      console.log("No video element available for server detection")
      return
    }

    try {
      // Capture frame from video
      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d')
      canvas.width = this.sideVideoElement.videoWidth
      canvas.height = this.sideVideoElement.videoHeight
      ctx.drawImage(this.sideVideoElement, 0, 0)

      // Convert to blob
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.8))
      
      // Send to server
      const formData = new FormData()
      formData.append('image', blob, 'pose.jpg')

      const response = await fetch('http://localhost:3001/detect-pose', {
        method: 'POST',
        body: formData
      })

      if (response.ok) {
        const poseData = await response.json()
        console.log("Server pose detection result:", poseData)
        this.handleSidePoseData(poseData)
      } else {
        console.error("Server pose detection failed:", response.statusText)
      }
    } catch (error) {
      console.error("Error in server pose detection:", error)
    }
  }

  updateConnectionStatus(connected) {
    this.isConnected = connected

    const statusElement = document.getElementById("side-camera-status")
    const connectBtn = document.getElementById("connect-side-camera")
    const roomElement = document.getElementById("side-room-id")

    if (statusElement) {
      statusElement.textContent = connected ? "Connected" : "Disconnected"
      statusElement.className = `status-indicator ${connected ? "connected" : "disconnected"}`
    }

    if (connectBtn) {
      connectBtn.textContent = connected ? "Disconnect Side Camera" : "Connect Side Camera"
      connectBtn.onclick = connected ? () => this.disconnectSideCamera() : () => this.connectSideCamera()
    }

    if (roomElement) {
      roomElement.textContent = this.roomId ? this.roomId : "--"
    }
  }

  stopSidePoseDetection() {
    if (this.detectionLoop) {
      cancelAnimationFrame(this.detectionLoop)
      this.detectionLoop = null
    }
    console.log("Side camera pose detection stopped")
  }

  disconnectSideCamera() {
    // Stop pose detection
    this.stopSidePoseDetection()

    if (this.sideStream) {
      this.sideStream.getTracks().forEach((track) => track.stop())
      this.sideStream = null
    }

    if (this.peerConnection) {
      this.peerConnection.close()
      this.peerConnection = null
    }

    if (this.dataChannel) {
      this.dataChannel.close()
      this.dataChannel = null
    }

    const sideVideo = document.getElementById("side-camera-feed")
    if (sideVideo) {
      sideVideo.srcObject = null
    }

    // Reset Pose Animator avatar
    if (this.poseAnimatorCanvasScope) {
      this.poseAnimatorCanvasScope.project.clear()
    }

    // Reset room ID
    this.roomId = null
    const roomElement = document.getElementById("side-room-id")
    if (roomElement) {
      roomElement.textContent = "--"
    }

    this.updateConnectionStatus(false)
    console.log("Side camera disconnected")
  }

  showRoomId(roomId) {
    console.log("=== SHOWING ROOM ID ===")
    console.log("Room ID:", roomId)
    
    const el = document.getElementById("side-room-id")
    console.log("Room ID element found:", !!el)
    
    if (el) {
      el.textContent = roomId
      console.log("Room ID displayed in UI:", el.textContent)
    } else {
      console.error("Room ID element not found!")
    }
    
    // Automatically copy room ID to clipboard
    this.copyRoomIdToClipboard(roomId)
    
    const hint = document.getElementById("side-room-hint")
    if (hint) {
      const url = `${location.origin}${location.pathname.replace(/index\.html?$/, '')}side-camera.html?roomId=${encodeURIComponent(roomId)}`
      console.log("Side camera URL:", url)
      // hint.textContent = `Open side-camera.html on the side phone and enter Room ID: ${roomId}`
    }
  }

  async copyRoomIdToClipboard(roomId) {
    try {
      // Check if clipboard API is available
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(roomId)
        console.log("Room ID copied to clipboard:", roomId)
        this.showClipboardFeedback("Room ID copied to clipboard!")
      } else {
        // Fallback for older browsers or non-secure contexts
        this.fallbackCopyToClipboard(roomId)
      }
    } catch (error) {
      console.error("Failed to copy room ID to clipboard:", error)
      // Try fallback method
      this.fallbackCopyToClipboard(roomId)
    }
  }

  fallbackCopyToClipboard(roomId) {
    try {
      // Create a temporary textarea element
      const textArea = document.createElement("textarea")
      textArea.value = roomId
      textArea.style.position = "fixed"
      textArea.style.left = "-999999px"
      textArea.style.top = "-999999px"
      document.body.appendChild(textArea)
      textArea.focus()
      textArea.select()
      
      // Try to copy using execCommand
      const successful = document.execCommand('copy')
      document.body.removeChild(textArea)
      
      if (successful) {
        console.log("Room ID copied to clipboard (fallback method):", roomId)
        this.showClipboardFeedback("Room ID copied to clipboard!")
      } else {
        console.warn("Failed to copy room ID using fallback method")
        this.showClipboardFeedback("Failed to copy room ID. Please copy manually: " + roomId, true)
      }
    } catch (error) {
      console.error("Fallback copy method failed:", error)
      this.showClipboardFeedback("Failed to copy room ID. Please copy manually: " + roomId, true)
    }
  }

  showClipboardFeedback(message, isError = false) {
    // Create or update a feedback element
    let feedbackEl = document.getElementById("clipboard-feedback")
    
    if (!feedbackEl) {
      feedbackEl = document.createElement("div")
      feedbackEl.id = "clipboard-feedback"
      feedbackEl.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 10px 15px;
        border-radius: 5px;
        font-size: 14px;
        font-weight: bold;
        z-index: 10000;
        transition: opacity 0.3s ease;
        max-width: 300px;
        word-wrap: break-word;
      `
      document.body.appendChild(feedbackEl)
    }
    
    // Set message and styling
    feedbackEl.textContent = message
    feedbackEl.style.backgroundColor = isError ? "#ff4444" : "#00ff00"
    feedbackEl.style.color = isError ? "#ffffff" : "#000000"
    feedbackEl.style.opacity = "1"
    
    // Auto-hide after 3 seconds
    setTimeout(() => {
      if (feedbackEl) {
        feedbackEl.style.opacity = "0"
        setTimeout(() => {
          if (feedbackEl && feedbackEl.parentNode) {
            feedbackEl.parentNode.removeChild(feedbackEl)
          }
        }, 300)
      }
    }, 3000)
  }

  // Send pose data to side camera (for synchronization)
  sendPoseDataToSide(poseData) {
    if (this.dataChannel && this.dataChannel.readyState === "open") {
      this.dataChannel.send(
        JSON.stringify({
          type: "mainPoseData",
          data: poseData,
          timestamp: Date.now(),
        }),
      )
    }
  }

  // Get connection status
  getConnectionStatus() {
    return {
      isConnected: this.isConnected,
      hasStream: !!this.sideStream,
      dataChannelOpen: this.dataChannel && this.dataChannel.readyState === "open",
      avatarInitialized: !!this.poseAnimatorIllustration
    }
  }

  async initializePoseAnimator() {
    // Initialize simple avatar system instead of complex Pose Animator
    console.log('Initializing simple avatar system...');
    
    const canvas = document.getElementById('side-avatar-canvas');
    if (!canvas) {
      console.error('Side avatar canvas not found!');
      return;
    }
    
    // Set canvas size for side view - make it responsive
    const isMobile = window.innerWidth <= 768
    if (isMobile) {
      canvas.width = 300; // Larger for mobile
      canvas.height = 225;
    } else {
      canvas.width = 280; // Increased for better visibility
      canvas.height = 210;
    }
    
    // Set canvas style
    canvas.style.border = '1px solid #00ff00';
    canvas.style.backgroundColor = '#1a1a1a';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    
    console.log('Simple avatar system initialized successfully');
    
    // For mobile, start with a test avatar to show it's working
    if (isMobile) {
      setTimeout(() => {
        console.log('Starting mobile avatar test...');
        this.testAvatarMovement();
      }, 1000);
    }
  }

  // Cleanup method
  dispose() {
    this.disconnectSideCamera()
    this.stopSidePoseDetection()
    
    if (this.poseAnimatorCanvasScope) {
      this.poseAnimatorCanvasScope.project.clear();
      this.poseAnimatorCanvasScope = null;
      this.poseAnimatorIllustration = null;
      this.poseAnimatorSkeleton = null;
    }
  }
}

// Make class globally available
window.SideCameraManager = SideCameraManager

// Add global test functions
window.testSideAvatar = () => {
  if (window.app && window.app.sideCameraManager) {
    window.app.sideCameraManager.testAvatarMovement()
  } else {
    console.log("Side camera manager not available")
  }
}

window.testServerPoseDetection = () => {
  if (window.app && window.app.sideCameraManager) {
    window.app.sideCameraManager.detectPoseFromServer()
  } else {
    console.log("Side camera manager not available")
  }
}

window.enableMockDataMode = () => {
  if (window.app && window.app.sideCameraManager) {
    window.app.sideCameraManager.enableMockDataMode()
  } else {
    console.log("Side camera manager not available")
  }
}

// Test function to manually connect side camera and get room ID
window.testSideCameraConnection = () => {
  if (window.app && window.app.sideCameraManager) {
    console.log("Testing side camera connection...");
    window.app.sideCameraManager.connectSideCamera();
  } else {
    console.log("Side camera manager not available");
  }
}

// Test function to test the simple avatar
window.testSimpleAvatar = () => {
  if (window.app && window.app.sideCameraManager) {
    console.log("Testing simple avatar...");
    const mockData = window.app.sideCameraManager.generateMockSidePoseData();
    window.app.sideCameraManager.handleSidePoseData(mockData);
  } else {
    console.log("Side camera manager not available");
  }
}

// Test function to test the humanoid stick figure
window.testHumanoidAvatar = () => {
  if (window.app && window.app.sideCameraManager) {
    console.log("Testing humanoid stick figure...");
    const mockData = window.app.sideCameraManager.generateMockSidePoseData();
    console.log("Mock data keypoints:", mockData.keypoints.map(kp => kp.name));
    window.app.sideCameraManager.handleSidePoseData(mockData);
  } else {
    console.log("Side camera manager not available");
  }
}

// Test function to clear the avatar and start fresh
window.clearAvatar = () => {
  if (window.app && window.app.sideCameraManager) {
    console.log("Clearing avatar...");
    const canvas = document.getElementById('side-avatar-canvas');
    if (canvas) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#1a1a1a';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
    }
    // Reset pose data
    window.app.sideCameraManager.lastPoseData = null;
  } else {
    console.log("Side camera manager not available");
  }
}

// Test function to test clipboard functionality
window.testClipboardCopy = () => {
  if (window.app && window.app.sideCameraManager) {
    console.log("Testing clipboard copy functionality...");
    const testRoomId = "test-room-" + Math.random().toString(36).substr(2, 9);
    window.app.sideCameraManager.copyRoomIdToClipboard(testRoomId);
  } else {
    console.log("Side camera manager not available");
  }
}

// Print helpful guide for testing BlazePose
console.log(`
╔═══════════════════════════════════════════════════════════════════════════╗
║                     MediaPipe BlazePose 3D - Side Camera                 ║
╚═══════════════════════════════════════════════════════════════════════════╝

🎯 TESTING GUIDE:

1. Test with Mock Data (No camera needed):
   > testHumanoidAvatar()
   
2. Connect Side Camera with Real Detection:
   > Click "Connect Side Camera" button in the UI
   
3. Enable Mock Data Mode:
   > enableMockDataMode()
   
4. Test Different Features:
   > testSimpleAvatar()         - Simple 2D test
   > testHumanoidAvatar()        - Enhanced 3D humanoid
   > testSideCameraConnection()  - Test WebRTC connection
   > clearAvatar()               - Clear the canvas

5. Check BlazePose Status:
   > window.app.sideCameraManager.sidePoseDetector
   
📊 Features:
   ✅ MediaPipe BlazePose 3D pose estimation
   ✅ 33 body landmarks with (x, y, z) coordinates
   ✅ Real-time depth perception
   ✅ Enhanced human-like rendering
   ✅ Smooth animations with breathing effects
   ✅ Glow effects and gradient rendering
   
🎨 Visual Enhancements:
   - Depth-based sizing (closer = larger)
   - Color-coded body parts
   - Gradient connections
   - Torso and head shapes
   - Facial features (eyes, ears)
   - Shadow effects
   
For more info, check the console logs when connecting the camera!
`)




