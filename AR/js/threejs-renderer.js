class ThreeJSRenderer {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId)
    this.scene = null
    this.camera = null
    this.renderer = null
    this.skeletonGroup = null
    this.joints = []
    this.connections = []
    this.isInitialized = false

    // Rendering settings
    this.jointRadius = 0.02
    this.connectionRadius = 0.005
    this.jointColor = 0x00ff88
    this.connectionColor = 0x00ff88
    this.highlightColor = 0xff6b6b

    // Animation properties
    this.animationId = null
    this.highlightedJoints = []

    this.initialize()
  }

  initialize() {
    if (!this.canvas) {
      console.error("ThreeJS canvas not found")
      return
    }

    try {
      // Create scene
      this.scene = new window.THREE.Scene()

      // Create camera
      this.camera = new window.THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 1000)
      this.camera.position.z = 1

      // Create renderer
      this.renderer = new window.THREE.WebGLRenderer({
        canvas: this.canvas,
        alpha: true,
        antialias: true,
      })
      this.renderer.setSize(this.canvas.clientWidth, this.canvas.clientHeight)
      this.renderer.setClearColor(0x000000, 0)

      // Create skeleton group
      this.skeletonGroup = new window.THREE.Group()
      this.scene.add(this.skeletonGroup)

      // Handle window resize
      window.addEventListener("resize", () => this.handleResize())

      this.isInitialized = true
      console.log("ThreeJS renderer initialized")

      // Start render loop
      this.startRenderLoop()
    } catch (error) {
      console.error("Failed to initialize ThreeJS renderer:", error)
    }
  }

  handleResize() {
    if (!this.renderer || !this.camera) return

    const rect = this.canvas.getBoundingClientRect()
    this.renderer.setSize(rect.width, rect.height)

    // Update camera aspect ratio for orthographic camera
    const aspect = rect.width / rect.height
    this.camera.left = -aspect
    this.camera.right = aspect
    this.camera.updateProjectionMatrix()
  }

  createJointMaterial(isHighlighted = false) {
    return new window.THREE.MeshBasicMaterial({
      color: isHighlighted ? this.highlightColor : this.jointColor,
      transparent: true,
      opacity: isHighlighted ? 0.9 : 0.8,
    })
  }

  createConnectionMaterial() {
    return new window.THREE.MeshBasicMaterial({
      color: this.connectionColor,
      transparent: true,
      opacity: 0.7,
    })
  }

  drawPoses(poses, highlightedJoints = []) {
    if (!this.isInitialized || !poses || poses.length === 0) {
      this.clearSkeleton()
      return
    }

    // Always clear skeleton first to ensure single skeleton
    this.clearSkeleton()
    this.highlightedJoints = highlightedJoints

    // Only process the first (most confident) pose to ensure single skeleton
    const pose = poses[0]
    if (!pose || !pose.keypoints) {
      return
    }

    const keypoints = pose.keypoints

    // Convert keypoints to normalized coordinates
    const normalizedKeypoints = this.normalizeKeypoints(keypoints)
    
    // Validate normalized keypoints
    if (!normalizedKeypoints || normalizedKeypoints.length === 0) {
      return
    }

    // Draw connections
    this.drawConnections(normalizedKeypoints)

    // Draw joints
    this.drawJoints(normalizedKeypoints)
  }

  // normalizeKeypoints(keypoints) {
  //   // Convert from pixel coordinates to normalized coordinates (-1 to 1)
  //   const videoElement = document.getElementById("camera-feed")
  //   if (!videoElement || !keypoints) return keypoints

  //   const videoWidth = videoElement.videoWidth || videoElement.clientWidth || 640
  //   const videoHeight = videoElement.videoHeight || videoElement.clientHeight || 480

  //   // Ensure we have valid dimensions
  //   if (!videoWidth || !videoHeight) {
  //     console.warn('Invalid video dimensions for ThreeJS skeleton scaling')
  //     return keypoints
  //   }

  //   return keypoints.map((keypoint) => {
  //     if (!keypoint || keypoint.score < 0.1) return keypoint // Skip low confidence points
      
  //     // Scale to normalized coordinates
  //     const normalizedX = (keypoint.x / videoWidth) * 2 - 1
  //     const normalizedY = -((keypoint.y / videoHeight) * 2 - 1)
      
  //     // No mirroring needed - the video feed is not mirrored
  //     return {
  //       ...keypoint,
  //       x: normalizedX,
  //       y: normalizedY,
  //       z: 0,
  //     }
  //   })
  // }


// ... inside ThreeJSRenderer class

normalizeKeypoints(keypoints) {
  const videoElement = document.getElementById("camera-feed") // Get the video element ID used in your HTML
  if (!videoElement || !keypoints) return []

  // 1. Get Intrinsic Video Dimensions (Source Resolution)
  const videoWidth = videoElement.videoWidth
  const videoHeight = videoElement.videoHeight

  // 2. Get Canvas Rendered Dimensions (Destination Display Size/Bounding Box)
  const rect = videoElement.getBoundingClientRect()
  const displayedWidth = rect.width
  const displayedHeight = rect.height
  
  // We assume ThreeJS canvas is also sized to the video element's rect.

  if (!videoWidth || !videoHeight || !displayedWidth || !displayedHeight) {
      console.warn('Invalid dimensions for ThreeJS scaling')
      return keypoints
  }
  
  // --- Core Scaling Logic for object-fit: cover ---

  const widthRatio = displayedWidth / videoWidth
  const heightRatio = displayedHeight / videoHeight

  // Use the *larger* ratio (for 'cover')
  const scale = Math.max(widthRatio, heightRatio)

  const scaledVideoWidth = videoWidth * scale
  const scaledVideoHeight = videoHeight * scale

  // Pixel offset from the edge of the displayed video element
  const offsetX = (displayedWidth - scaledVideoWidth) / 2
  const offsetY = (displayedHeight - scaledVideoHeight) / 2
  
  // --- End Core Scaling Logic ---

  return keypoints.map((keypoint) => {
      if (!keypoint || keypoint.score < 0.1) return keypoint
      
      // 1. Scale and Offset to the displayed pixel coordinates
      const scaledX_px = keypoint.x * scale + offsetX
      const scaledY_px = keypoint.y * scale + offsetY

      // 2. Convert to Normalized Coordinates (-1 to 1) relative to the displayed area
      // Normalized X: (Pixel X / Displayed Width) * 2 - 1
      const normalizedX = (scaledX_px / displayedWidth) * 2 - 1
      
      // Normalized Y: -((Pixel Y / Displayed Height) * 2 - 1) (Y is flipped in Three.js)
      const normalizedY = -((scaledY_px / displayedHeight) * 2 - 1)
      
      // If front camera mirroring is used, flip X in normalized space:
      // const finalX = -normalizedX;

      return {
          ...keypoint,
          x: normalizedX,
          y: normalizedY,
          z: 0,
      }
  })
}


  drawJoints(keypoints) {
    const poseDetector = window.poseDetector
    if (!poseDetector || !poseDetector.keypointNames) return

    const jointGeometry = new window.THREE.SphereGeometry(this.jointRadius, 8, 8)

    keypoints.forEach((keypoint, index) => {
      // Validate keypoint and confidence
      if (!keypoint || keypoint.score < 0.3) return
      
      // Validate coordinates
      if (typeof keypoint.x !== 'number' || typeof keypoint.y !== 'number') return
      
      // Check if coordinates are within reasonable bounds
      if (Math.abs(keypoint.x) > 2 || Math.abs(keypoint.y) > 2) return

      const jointName = poseDetector.keypointNames[index]
      const isHighlighted = this.highlightedJoints.includes(jointName)

      const jointMaterial = this.createJointMaterial(isHighlighted)
      const jointMesh = new window.THREE.Mesh(jointGeometry, jointMaterial)

      jointMesh.position.set(keypoint.x, keypoint.y, keypoint.z || 0)

      // Add pulsing animation for highlighted joints
      if (isHighlighted) {
        jointMesh.userData.isHighlighted = true
        jointMesh.userData.pulsePhase = Math.random() * Math.PI * 2
      }

      this.skeletonGroup.add(jointMesh)
      this.joints.push(jointMesh)
    })
  }

  drawConnections(keypoints) {
    const poseDetector = window.poseDetector
    if (!poseDetector || !poseDetector.connections) return

    const connectionMaterial = this.createConnectionMaterial()

    poseDetector.connections.forEach(([startIdx, endIdx]) => {
      // Validate indices
      if (startIdx >= keypoints.length || endIdx >= keypoints.length) return
      
      const startPoint = keypoints[startIdx]
      const endPoint = keypoints[endIdx]

      // Check if both points exist and have sufficient confidence
      if (startPoint && endPoint && 
          startPoint.score > 0.3 && endPoint.score > 0.3 &&
          typeof startPoint.x === 'number' && typeof startPoint.y === 'number' &&
          typeof endPoint.x === 'number' && typeof endPoint.y === 'number') {
        
        const connection = this.createConnection(startPoint, endPoint, connectionMaterial)
        this.skeletonGroup.add(connection)
        this.connections.push(connection)
      }
    })
  }

  createConnection(startPoint, endPoint, material) {
    const distance = Math.sqrt(
      Math.pow(endPoint.x - startPoint.x, 2) +
        Math.pow(endPoint.y - startPoint.y, 2) +
        Math.pow(endPoint.z - startPoint.z, 2),
    )

    const geometry = new window.THREE.CylinderGeometry(this.connectionRadius, this.connectionRadius, distance, 8)

    const connection = new window.THREE.Mesh(geometry, material)

    // Position the connection
    connection.position.set(
      (startPoint.x + endPoint.x) / 2,
      (startPoint.y + endPoint.y) / 2,
      (startPoint.z + endPoint.z) / 2,
    )

    // Rotate to align with the connection vector
    const direction = new window.THREE.Vector3(
      endPoint.x - startPoint.x,
      endPoint.y - startPoint.y,
      endPoint.z - startPoint.z,
    ).normalize()

    const up = new window.THREE.Vector3(0, 1, 0)
    const quaternion = new window.THREE.Quaternion().setFromUnitVectors(up, direction)
    connection.setRotationFromQuaternion(quaternion)

    return connection
  }

  clearSkeleton() {
    // Remove all joints and connections
    this.joints.forEach((joint) => {
      this.skeletonGroup.remove(joint)
      joint.geometry.dispose()
      joint.material.dispose()
    })

    this.connections.forEach((connection) => {
      this.skeletonGroup.remove(connection)
      connection.geometry.dispose()
      connection.material.dispose()
    })

    this.joints = []
    this.connections = []
  }

  startRenderLoop() {
    const animate = () => {
      this.animationId = requestAnimationFrame(animate)

      // Update highlighted joint animations
      this.updateAnimations()

      // Render the scene
      if (this.renderer && this.scene && this.camera) {
        this.renderer.render(this.scene, this.camera)
      }
    }

    animate()
  }

  updateAnimations() {
    const time = Date.now() * 0.005

    this.joints.forEach((joint) => {
      if (joint.userData.isHighlighted) {
        const pulsePhase = joint.userData.pulsePhase || 0
        const scale = 1 + 0.3 * Math.sin(time * 3 + pulsePhase)
        joint.scale.setScalar(scale)

        // Update material opacity
        joint.material.opacity = 0.7 + 0.3 * Math.sin(time * 2 + pulsePhase)
      }
    })
  }

  stopRenderLoop() {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId)
      this.animationId = null
    }
  }

  setVisibility(visible) {
    if (this.skeletonGroup) {
      this.skeletonGroup.visible = visible
    }
  }

  dispose() {
    this.stopRenderLoop()
    this.clearSkeleton()

    if (this.renderer) {
      this.renderer.dispose()
    }

    if (this.scene) {
      this.scene.clear()
    }
  }
}

// Make class globally available
window.ThreeJSRenderer = ThreeJSRenderer
