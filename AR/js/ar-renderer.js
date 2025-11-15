class ARRenderer {
  constructor(canvasId, videoElement) {
    this.canvas = document.getElementById(canvasId)
    this.ctx = this.canvas.getContext("2d")
    this.videoElement = videoElement
    this.showSkeleton = true
    this.highlightedJoints = []

    // Resize canvas to match video
    this.resizeCanvas()
    window.addEventListener("resize", () => this.resizeCanvas())
    
    // Listen for video element changes
    if (this.videoElement) {
      this.videoElement.addEventListener('loadedmetadata', () => this.resizeCanvas())
      this.videoElement.addEventListener('resize', () => this.resizeCanvas())
    }

    // Skeleton rendering settings
    this.jointRadius = 6
    this.connectionWidth = 3
    this.jointColor = "#00ff88"
    this.connectionColor = "#00ff88"
    this.highlightColor = "#ff6b6b"

    // Animation properties
    this.animationFrame = null
    this.pulsePhase = 0
    
    // Cache mobile detection to avoid repeated DOM checks (performance optimization)
    this._isMobileCached = null
    this._mobileCheckTime = 0
  }
  
  _isMobile() {
    // Cache the result for 1 second to avoid repeated DOM checks
    const now = Date.now()
    if (this._isMobileCached === null || (now - this._mobileCheckTime) > 1000) {
      this._isMobileCached = document.body.classList.contains('mobile-device') || 
                             (window.app && window.app.isMobile)
      this._mobileCheckTime = now
    }
    return this._isMobileCached
  }

  resizeCanvas() {
    if (!this.videoElement) return
    
    // For mobile: Use full viewport dimensions to match the fixed-position video
    const canvasWidth = window.innerWidth
    const canvasHeight = window.innerHeight
    
    // Set canvas internal dimensions (for drawing)
    this.canvas.width = canvasWidth
    this.canvas.height = canvasHeight

    // Update canvas style to match video dimensions exactly
    this.canvas.style.width = canvasWidth + "px"
    this.canvas.style.height = canvasHeight + "px"
    
    // Ensure canvas is positioned exactly over the video (fixed position like video)
    this.canvas.style.position = 'fixed'
    this.canvas.style.top = '0'
    this.canvas.style.left = '0'
    this.canvas.style.pointerEvents = 'none'
    this.canvas.style.zIndex = '10'
    
    // Debug logging
    if (window.DEBUG_SKELETON) {
      console.log('Canvas resized:', {
        canvasWidth,
        canvasHeight,
        windowSize: { w: window.innerWidth, h: window.innerHeight },
        videoSize: { w: this.videoElement.videoWidth, h: this.videoElement.videoHeight }
      })
    }
  }

  clear() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height)
  }

  drawPoses(poses, highlightedJoints = []) {
    if (!this.showSkeleton || !poses || poses.length === 0) {
      this.clear()
      return
    }

    // Always clear the canvas first
    this.clear()
    this.highlightedJoints = highlightedJoints

    // Only process the first (most confident) pose to ensure single skeleton
    const pose = poses[0]
    if (!pose || !pose.keypoints) {
      return
    }

    const keypoints = pose.keypoints

    // Scale keypoints to canvas dimensions
    const scaledKeypoints = this.scaleKeypoints(keypoints)
    
    // Validate scaled keypoints
    if (!scaledKeypoints || scaledKeypoints.length === 0) {
      return
    }

    // Draw connections first (so they appear behind joints)
    this.drawConnections(scaledKeypoints)

    // Draw joints
    this.drawJoints(scaledKeypoints)

    // Draw additional visual cues
    this.drawPostureCues(scaledKeypoints)
  }

  // scaleKeypoints(keypoints) {
  //   if (!this.videoElement || !keypoints) return []
    
  //   // Get the actual video element dimensions and position
  //   const videoRect = this.videoElement.getBoundingClientRect()
  //   const videoWidth = this.videoElement.videoWidth || this.videoElement.clientWidth
  //   const videoHeight = this.videoElement.videoHeight || this.videoElement.clientHeight
    
  //   // Ensure we have valid dimensions
  //   if (!videoWidth || !videoHeight || !this.canvas.width || !this.canvas.height) {
  //     console.warn('Invalid video or canvas dimensions for skeleton scaling', {
  //       videoWidth,
  //       videoHeight,
  //       canvasWidth: this.canvas.width,
  //       canvasHeight: this.canvas.height
  //     })
  //     return keypoints
  //   }

  //   // SIMPLIFIED APPROACH: Direct scaling without CSS transform compensation
  //   // The video element and canvas should have the same dimensions
  //   // Just scale from video natural size to canvas display size
    
  //   const scaleX = this.canvas.width / videoWidth
  //   const scaleY = this.canvas.height / videoHeight

  //   // Debug logging
  //   if (window.DEBUG_SKELETON) {
  //     console.log('Skeleton scaling debug:', {
  //       videoSize: { w: videoWidth, h: videoHeight },
  //       canvasSize: { w: this.canvas.width, h: this.canvas.height },
  //       scale: { x: scaleX.toFixed(4), y: scaleY.toFixed(4) }
  //     })
  //   }

  //   return keypoints.map((keypoint) => {
  //     if (!keypoint || keypoint.score < 0.1) return keypoint
      
  //     // Simple direct scaling
  //     const scaledX = keypoint.x * scaleX
  //     const scaledY = keypoint.y * scaleY
      
  //     // Debug logging
  //     if (window.DEBUG_SKELETON) {
  //       console.log(`${keypoint.name}:`, {
  //         original: `(${keypoint.x.toFixed(0)}, ${keypoint.y.toFixed(0)})`,
  //         scaled: `(${scaledX.toFixed(1)}, ${scaledY.toFixed(1)})`
  //       })
  //     }
      
  //     return {
  //       ...keypoint,
  //       x: scaledX,
  //       y: scaledY,
  //     }
  //   })
  // }


// ... inside ARRenderer class

scaleKeypoints(keypoints) {
  if (!this.videoElement || !keypoints) return []
  
  // 1. Get Intrinsic Video Dimensions (Source Resolution)
  const videoWidth = this.videoElement.videoWidth
  const videoHeight = this.videoElement.videoHeight
  
  // 2. Get Video Element's RENDERED Dimensions (Destination Display Size/Bounding Box)
  // This is the true size of the area the skeleton must cover.
  const rect = this.videoElement.getBoundingClientRect()
  const displayedWidth = rect.width
  const displayedHeight = rect.height
  
  // 3. Get Canvas Internal Dimensions (Drawing Resolution)
  const canvasWidth = this.canvas.width
  const canvasHeight = this.canvas.height
  
  if (!videoWidth || !videoHeight || !canvasWidth || !canvasHeight) {
      console.warn('Invalid dimensions for ARRenderer scaling')
      return keypoints
  }

  // --- Core Scaling Logic for object-fit: cover ---

  // Calculate the ratio of intrinsic video size to displayed video size
  const widthRatio = displayedWidth / videoWidth
  const heightRatio = displayedHeight / videoHeight

  // Use the *larger* ratio (for 'cover') to determine the scale
  const scale = Math.max(widthRatio, heightRatio)

  // Calculate the actual scaled dimensions of the video content
  const scaledVideoWidth = videoWidth * scale
  const scaledVideoHeight = videoHeight * scale

  // Calculate the offset (paddings) to center the scaled content within the canvas
  // Since the canvas matches the bounding box, we use canvas dimensions for centering
  const offsetX = (canvasWidth - scaledVideoWidth) / 2
  const offsetY = (canvasHeight - scaledVideoHeight) / 2
  
  // --- End Core Scaling Logic ---

  return keypoints.map((keypoint) => {
      if (!keypoint || keypoint.score < 0.1) return keypoint
      
      // Apply calculated scale and offset
      let scaledX = keypoint.x * scale + offsetX
      const scaledY = keypoint.y * scale + offsetY
      
      // Use cached mobile detection for performance
      const isMobile = this._isMobile()
      
      // Only flip coordinates on desktop (front camera with CSS flip)
      // Mobile (back camera) doesn't need coordinate flip since CSS doesn't flip it
      // No action needed - CSS handles the flip on desktop
      
      return {
          ...keypoint,
          x: scaledX,
          y: scaledY,
      }
  })
}

  drawJoints(keypoints) {
    const poseDetector = window.poseDetector
    if (!poseDetector || !poseDetector.keypointNames) return

    keypoints.forEach((keypoint, index) => {
      // Validate keypoint and confidence
      if (!keypoint || keypoint.score < 0.3) return
      
      // Validate coordinates
      if (typeof keypoint.x !== 'number' || typeof keypoint.y !== 'number') return
      
      // Check if coordinates are within canvas bounds
      if (keypoint.x < 0 || keypoint.x > this.canvas.width || 
          keypoint.y < 0 || keypoint.y > this.canvas.height) return

      const jointName = poseDetector.keypointNames[index]
      const isHighlighted = this.highlightedJoints.includes(jointName)

      this.ctx.beginPath()
      this.ctx.arc(keypoint.x, keypoint.y, this.jointRadius, 0, 2 * Math.PI)

      if (isHighlighted) {
        // Pulsing effect for highlighted joints
        const alpha = 0.7 + 0.3 * Math.sin(this.pulsePhase)
        this.ctx.fillStyle =
          this.highlightColor +
          Math.floor(alpha * 255)
            .toString(16)
            .padStart(2, "0")
        this.ctx.shadowColor = this.highlightColor
        this.ctx.shadowBlur = 15
      } else {
        this.ctx.fillStyle = this.jointColor
        this.ctx.shadowColor = this.jointColor
        this.ctx.shadowBlur = 10
      }

      this.ctx.fill()
      this.ctx.shadowBlur = 0

      // Draw joint label for debugging (optional)
      if (window.DEBUG_MODE) {
        this.ctx.fillStyle = "#ffffff"
        this.ctx.font = "10px Arial"
        this.ctx.fillText(jointName, keypoint.x + 10, keypoint.y - 10)
      }
    })

    // Update pulse phase for animation
    this.pulsePhase += 0.1
  }

  drawConnections(keypoints) {
    const poseDetector = window.poseDetector
    if (!poseDetector || !poseDetector.connections) return

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
        
        this.ctx.beginPath()
        this.ctx.moveTo(startPoint.x, startPoint.y)
        this.ctx.lineTo(endPoint.x, endPoint.y)

        this.ctx.strokeStyle = this.connectionColor
        this.ctx.lineWidth = this.connectionWidth
        this.ctx.shadowColor = this.connectionColor
        this.ctx.shadowBlur = 5
        this.ctx.stroke()
        this.ctx.shadowBlur = 0
      }
    })
  }

  drawPostureCues(keypoints) {
    // Draw alignment guides
    this.drawAlignmentGuides(keypoints)

    // Draw range of motion indicators
    this.drawRangeIndicators(keypoints)
  }

  drawAlignmentGuides(keypoints) {
    const poseDetector = window.poseDetector

    // Shoulder alignment line
    const leftShoulder = keypoints[poseDetector.keypointNames.indexOf("left_shoulder")]
    const rightShoulder = keypoints[poseDetector.keypointNames.indexOf("right_shoulder")]

    if (leftShoulder && rightShoulder && leftShoulder.score > 0.3 && rightShoulder.score > 0.3) {
      this.ctx.beginPath()
      this.ctx.setLineDash([5, 5])
      this.ctx.moveTo(leftShoulder.x - 50, leftShoulder.y)
      this.ctx.lineTo(rightShoulder.x + 50, rightShoulder.y)
      this.ctx.strokeStyle = "#ffff00"
      this.ctx.lineWidth = 1
      this.ctx.stroke()
      this.ctx.setLineDash([])
    }

    // Hip alignment line
    const leftHip = keypoints[poseDetector.keypointNames.indexOf("left_hip")]
    const rightHip = keypoints[poseDetector.keypointNames.indexOf("right_hip")]

    if (leftHip && rightHip && leftHip.score > 0.3 && rightHip.score > 0.3) {
      this.ctx.beginPath()
      this.ctx.setLineDash([5, 5])
      this.ctx.moveTo(leftHip.x - 50, leftHip.y)
      this.ctx.lineTo(rightHip.x + 50, rightHip.y)
      this.ctx.strokeStyle = "#ffff00"
      this.ctx.lineWidth = 1
      this.ctx.stroke()
      this.ctx.setLineDash([])
    }
  }

  drawRangeIndicators(keypoints) {
    const poseDetector = window.poseDetector

    // Draw elbow angle indicators for push-ups
    const leftShoulder = keypoints[poseDetector.keypointNames.indexOf("left_shoulder")]
    const leftElbow = keypoints[poseDetector.keypointNames.indexOf("left_elbow")]
    const leftWrist = keypoints[poseDetector.keypointNames.indexOf("left_wrist")]

    if (
      leftShoulder &&
      leftElbow &&
      leftWrist &&
      leftShoulder.score > 0.3 &&
      leftElbow.score > 0.3 &&
      leftWrist.score > 0.3
    ) {
      const angle = this.calculateAngle(leftShoulder, leftElbow, leftWrist)
      this.drawAngleIndicator(leftElbow, angle, 30)
    }

    const rightShoulder = keypoints[poseDetector.keypointNames.indexOf("right_shoulder")]
    const rightElbow = keypoints[poseDetector.keypointNames.indexOf("right_elbow")]
    const rightWrist = keypoints[poseDetector.keypointNames.indexOf("right_wrist")]

    if (
      rightShoulder &&
      rightElbow &&
      rightWrist &&
      rightShoulder.score > 0.3 &&
      rightElbow.score > 0.3 &&
      rightWrist.score > 0.3
    ) {
      const angle = this.calculateAngle(rightShoulder, rightElbow, rightWrist)
      this.drawAngleIndicator(rightElbow, angle, 30)
    }
  }

  drawAngleIndicator(center, angle, radius) {
    this.ctx.beginPath()
    this.ctx.arc(center.x, center.y, radius, 0, 2 * Math.PI)
    this.ctx.strokeStyle = angle < 90 ? "#ff6b6b" : "#00ff88"
    this.ctx.lineWidth = 2
    this.ctx.stroke()

    // Draw angle text
    this.ctx.fillStyle = "#ffffff"
    this.ctx.font = "12px Arial"
    this.ctx.fillText(Math.round(angle) + "°", center.x + radius + 5, center.y)
  }

  calculateAngle(point1, point2, point3) {
    const radians =
      Math.atan2(point3.y - point2.y, point3.x - point2.x) - Math.atan2(point1.y - point2.y, point1.x - point2.x)
    let angle = Math.abs((radians * 180.0) / Math.PI)
    if (angle > 180.0) {
      angle = 360 - angle
    }
    return angle
  }

  toggleSkeleton() {
    this.showSkeleton = !this.showSkeleton
    if (!this.showSkeleton) {
      this.clear()
    }
    return this.showSkeleton
  }

  updateFeedbackVisuals(analysis) {
    // Store highlighted joints for rendering
    this.highlightedJoints = window.poseDetector.getHighlightedJoints(analysis)
  }

  startAnimation() {
    const animate = () => {
      this.animationFrame = requestAnimationFrame(animate)
      // Animation loop is handled by the main app
    }
    animate()
  }

  stopAnimation() {
    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame)
      this.animationFrame = null
    }
  }

  // Method to update video element reference
  setVideoElement(videoElement) {
    this.videoElement = videoElement
    if (this.videoElement) {
      this.videoElement.addEventListener('loadedmetadata', () => this.resizeCanvas())
      this.videoElement.addEventListener('resize', () => this.resizeCanvas())
    }
    this.resizeCanvas()
  }

  // Method to force canvas resize
  forceResize() {
    this.resizeCanvas()
  }

  // Method to enable debug mode
  enableDebugMode() {
    window.DEBUG_SKELETON = true
    console.log('Skeleton debug mode enabled')
  }

  // Method to disable debug mode
  disableDebugMode() {
    window.DEBUG_SKELETON = false
    console.log('Skeleton debug mode disabled')
  }
}

// Make class globally available
window.ARRenderer = ARRenderer
