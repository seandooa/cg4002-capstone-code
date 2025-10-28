class PoseDetector {
  constructor() {
    this.detector = null
    this.isInitialized = false
    this.isDetecting = false
    this.lastPoses = []
    this.currentExercise = "bicep-curls"

    // BlazePose keypoint connections for skeleton rendering
    // MediaPipe BlazePose has 33 landmarks
    this.connections = [
      // Face
      [0, 1], [1, 2], [2, 3], [3, 7],  // Right side
      [0, 4], [4, 5], [5, 6], [6, 8],  // Left side
      [9, 10],  // Mouth

      // Torso
      [11, 12],  // Shoulders
      [11, 23], [12, 24],  // Shoulders to hips
      [23, 24],  // Hips

      // Left arm
      [11, 13], [13, 15],  // Shoulder to elbow to wrist
      [15, 17], [15, 19], [15, 21],  // Wrist to hand
      [17, 19],  // Palm

      // Right arm
      [12, 14], [14, 16],  // Shoulder to elbow to wrist
      [16, 18], [16, 20], [16, 22],  // Wrist to hand
      [18, 20],  // Palm

      // Left leg
      [23, 25], [25, 27],  // Hip to knee to ankle
      [27, 29], [27, 31],  // Ankle to foot
      [29, 31],  // Foot

      // Right leg
      [24, 26], [26, 28],  // Hip to knee to ankle
      [28, 30], [28, 32],  // Ankle to foot
      [30, 32],  // Foot
    ]

    // BlazePose keypoint names (33 landmarks)
    // Reference: https://google.github.io/mediapipe/solutions/pose.html
    this.keypointNames = [
      "nose",                    // 0
      "left_eye_inner",          // 1
      "left_eye",                // 2
      "left_eye_outer",          // 3
      "right_eye_inner",         // 4
      "right_eye",               // 5
      "right_eye_outer",         // 6
      "left_ear",                // 7
      "right_ear",               // 8
      "mouth_left",              // 9
      "mouth_right",             // 10
      "left_shoulder",           // 11
      "right_shoulder",          // 12
      "left_elbow",              // 13
      "right_elbow",             // 14
      "left_wrist",              // 15
      "right_wrist",             // 16
      "left_pinky",              // 17
      "right_pinky",             // 18
      "left_index",              // 19
      "right_index",             // 20
      "left_thumb",              // 21
      "right_thumb",             // 22
      "left_hip",                // 23
      "right_hip",               // 24
      "left_knee",               // 25
      "right_knee",              // 26
      "left_ankle",              // 27
      "right_ankle",             // 28
      "left_heel",               // 29
      "right_heel",              // 30
      "left_foot_index",         // 31
      "right_foot_index",        // 32
    ]

    // Camera utility for MediaPipe
    this.camera = null
    this.videoElement = null
  }

  setExerciseType(exerciseType) {
    this.currentExercise = exerciseType
    console.log(`Exercise type set to: ${exerciseType}`)
  }

  async initialize() {
    try {
      console.log("Initializing BlazePose detector for main camera...")

      // Wait for MediaPipe Pose to be available
      if (typeof Pose === 'undefined') {
        console.warn("MediaPipe Pose not loaded yet, retrying...")
        await new Promise(resolve => setTimeout(resolve, 1000))
        return this.initialize()
      }

      // Initialize MediaPipe BlazePose
      this.detector = new Pose({
        locateFile: (file) => {
          return `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`
        }
      })

      // Configure BlazePose
      this.detector.setOptions({
        modelComplexity: 1, // 0, 1, or 2 (2 is most accurate but slower)
        smoothLandmarks: true,
        enableSegmentation: false,
        smoothSegmentation: false,
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5
      })

      this.isInitialized = true
      console.log("BlazePose detector initialized successfully for main camera")
      return true
    } catch (error) {
      console.error("Failed to initialize BlazePose detector:", error)
      return false
    }
  }

  async detectPoses(videoElement) {
    if (!this.isInitialized || !this.detector || this.isDetecting) {
      return []
    }

    try {
      this.isDetecting = true
      this.videoElement = videoElement

      // Create a promise to handle the async pose detection
      const poses = await new Promise((resolve, reject) => {
        // Set up one-time result handler
        const onResults = (results) => {
          if (!results || !results.poseLandmarks) {
            resolve([])
            return
          }

          // Convert BlazePose results to our format
          const pose = this.convertBlazePoseToPoseFormat(results)
          resolve(pose ? [pose] : [])
        }

        // Temporarily set the onResults callback
        this.detector.onResults(onResults)

        // Send the video frame for detection
        if (videoElement.readyState >= 2) {
          this.detector.send({ image: videoElement })
            .catch(err => {
              console.error("Error sending frame to BlazePose:", err)
              resolve([])
            })
        } else {
          resolve([])
        }
      })

      this.lastPoses = poses
      return poses
    } catch (error) {
      console.error("Error detecting poses:", error)
      return []
    } finally {
      this.isDetecting = false
    }
  }

  convertBlazePoseToPoseFormat(results) {
    const landmarks = results.poseLandmarks
    const worldLandmarks = results.poseWorldLandmarks

    if (!landmarks || landmarks.length === 0) {
      return null
    }

    // Convert to our keypoints format
    const keypoints = landmarks.map((landmark, index) => ({
      x: landmark.x * (this.videoElement?.videoWidth || 640),
      y: landmark.y * (this.videoElement?.videoHeight || 480),
      z: landmark.z || 0,
      score: landmark.visibility || 0.9,
      name: this.keypointNames[index]
    }))

    return {
      keypoints: keypoints,
      score: this.calculateAverageScore(keypoints),
      worldLandmarks: worldLandmarks
    }
  }

  calculateAverageScore(keypoints) {
    const validKeypoints = keypoints.filter(kp => kp.score > 0.1)
    if (validKeypoints.length === 0) return 0
    const sum = validKeypoints.reduce((acc, kp) => acc + kp.score, 0)
    return sum / validKeypoints.length
  }

  getKeypoint(poses, keypointName) {
    if (!poses || poses.length === 0) return null

    const pose = poses[0]
    const keypointIndex = this.keypointNames.indexOf(keypointName)

    if (keypointIndex === -1 || !pose.keypoints[keypointIndex]) {
      return null
    }

    const keypoint = pose.keypoints[keypointIndex]
    return keypoint.score > 0.3 ? keypoint : null // Confidence threshold
  }

  getPostureAnalysis(poses) {
    if (!poses || poses.length === 0) {
      return {
        status: "no_pose",
        feedback: ["No pose detected"],
        confidence: 0,
      }
    }

    // Route to specific exercise analysis
    switch (this.currentExercise) {
      case "bicep-curls":
        return this.analyzeBicepCurls(poses)
      case "lateral-raises":
        return this.analyzeLateralRaises(poses)
      case "squats":
        return this.analyzeSquats(poses)
      case "other":
        return this.analyzeOther(poses)
      default:
        return this.analyzeOther(poses)
    }
  }

  analyzeOther(poses) {
    const pose = poses[0]
    const keypoints = pose.keypoints

    const leftShoulder = this.getKeypoint(poses, "left_shoulder")
    const rightShoulder = this.getKeypoint(poses, "right_shoulder")
    const leftHip = this.getKeypoint(poses, "left_hip")
    const rightHip = this.getKeypoint(poses, "right_hip")

    const feedback = []
    let status = "good"
    const confidence = 0.7

    // Check if key points are visible
    if (!leftShoulder || !rightShoulder) {
      return {
        status: "incomplete",
        feedback: ["Position yourself so your body is fully visible"],
        confidence: 0.3,
      }
    }

    // Check shoulder alignment
    const shoulderDiff = Math.abs(leftShoulder.y - rightShoulder.y)
    if (shoulderDiff > 30) {
      feedback.push("Keep your shoulders level")
      status = "warning"
    }

    // Check body alignment if hips are visible
    if (leftHip && rightHip) {
      const bodyAngle = this.calculateBodyAngle(leftShoulder, rightShoulder, leftHip, rightHip)
      if (Math.abs(bodyAngle) > 20) {
        feedback.push("Keep your body aligned")
        status = "warning"
      }
    }

    if (feedback.length === 0) {
      feedback.push("Good posture!")
      status = "good"
    }

    return { status, feedback, confidence }
  }

  analyzeBicepCurls(poses) {
    const leftShoulder = this.getKeypoint(poses, "left_shoulder")
    const rightShoulder = this.getKeypoint(poses, "right_shoulder")
    const leftElbow = this.getKeypoint(poses, "left_elbow")
    const rightElbow = this.getKeypoint(poses, "right_elbow")
    const leftWrist = this.getKeypoint(poses, "left_wrist")
    const rightWrist = this.getKeypoint(poses, "right_wrist")

    const feedback = []
    let status = "good"
    const confidence = 0.8

    if (!leftShoulder || !rightShoulder || !leftElbow || !rightElbow) {
      return {
        status: "incomplete",
        feedback: ["Position yourself so your arms are fully visible"],
        confidence: 0.3,
      }
    }

    // Check if arms are at sides (starting position)
    if (leftElbow && rightElbow && leftWrist && rightWrist) {
      const leftArmAngle = this.calculateAngle(leftShoulder, leftElbow, leftWrist)
      const rightArmAngle = this.calculateAngle(rightShoulder, rightElbow, rightWrist)

      // Check for proper curl range
      if (leftArmAngle < 45 || rightArmAngle < 45) {
        feedback.push("Lower the weights more")
        status = "warning"
      } else if (leftArmAngle > 160 || rightArmAngle > 160) {
        feedback.push("Curl the weights up more")
        status = "warning"
      } else if (leftArmAngle > 90 && rightArmAngle > 90) {
        feedback.push("Good curl form!")
      }
    }

    // Check shoulder stability
    if (leftShoulder && rightShoulder) {
      const shoulderDiff = Math.abs(leftShoulder.y - rightShoulder.y)
      if (shoulderDiff > 20) {
        feedback.push("Keep your shoulders level and stable")
        status = "warning"
      }
    }

    if (feedback.length === 0) {
      feedback.push("Perfect bicep curl form!")
    }

    return { status, feedback, confidence }
  }

  analyzeLateralRaises(poses) {
    const leftShoulder = this.getKeypoint(poses, "left_shoulder")
    const rightShoulder = this.getKeypoint(poses, "right_shoulder")
    const leftElbow = this.getKeypoint(poses, "left_elbow")
    const rightElbow = this.getKeypoint(poses, "right_elbow")
    const leftWrist = this.getKeypoint(poses, "left_wrist")
    const rightWrist = this.getKeypoint(poses, "right_wrist")

    const feedback = []
    let status = "good"
    const confidence = 0.8

    if (!leftShoulder || !rightShoulder || !leftElbow || !rightElbow) {
      return {
        status: "incomplete",
        feedback: ["Position yourself so your arms are fully visible"],
        confidence: 0.3,
      }
    }

    // Check arm position for lateral raises
    if (leftElbow && rightElbow && leftWrist && rightWrist) {
      // Check if arms are raised to shoulder level
      const leftArmHeight = leftShoulder.y - leftWrist.y
      const rightArmHeight = rightShoulder.y - rightWrist.y

      if (leftArmHeight < 20 || rightArmHeight < 20) {
        feedback.push("Raise your arms to shoulder level")
        status = "warning"
      } else if (leftArmHeight > 80 || rightArmHeight > 80) {
        feedback.push("Lower your arms slightly")
        status = "warning"
      } else {
        feedback.push("Perfect shoulder height!")
      }

      // Check for proper elbow bend
      const leftArmAngle = this.calculateAngle(leftShoulder, leftElbow, leftWrist)
      const rightArmAngle = this.calculateAngle(rightShoulder, rightElbow, rightWrist)

      if (leftArmAngle < 150 || rightArmAngle < 150) {
        feedback.push("Keep a slight bend in your elbows")
        status = "warning"
      }
    }

    // Check shoulder alignment
    if (leftShoulder && rightShoulder) {
      const shoulderDiff = Math.abs(leftShoulder.y - rightShoulder.y)
      if (shoulderDiff > 15) {
        feedback.push("Keep your shoulders level")
        status = "warning"
      }
    }

    if (feedback.length === 0) {
      feedback.push("Excellent lateral raise form!")
    }

    return { status, feedback, confidence }
  }

  analyzeSquats(poses) {
    const leftShoulder = this.getKeypoint(poses, "left_shoulder")
    const rightShoulder = this.getKeypoint(poses, "right_shoulder")
    const leftHip = this.getKeypoint(poses, "left_hip")
    const rightHip = this.getKeypoint(poses, "right_hip")
    const leftKnee = this.getKeypoint(poses, "left_knee")
    const rightKnee = this.getKeypoint(poses, "right_knee")
    const leftAnkle = this.getKeypoint(poses, "left_ankle")
    const rightAnkle = this.getKeypoint(poses, "right_ankle")

    const feedback = []
    let status = "good"
    const confidence = 0.8

    if (!leftHip || !rightHip || !leftKnee || !rightKnee) {
      return {
        status: "incomplete",
        feedback: ["Position yourself so your lower body is fully visible"],
        confidence: 0.3,
      }
    }

    // Check knee position relative to toes
    if (leftKnee && rightKnee && leftAnkle && rightAnkle) {
      const leftKneeOverToes = leftKnee.x - leftAnkle.x
      const rightKneeOverToes = rightKnee.x - rightAnkle.x

      if (leftKneeOverToes > 50 || rightKneeOverToes > 50) {
        feedback.push("Keep your knees behind your toes")
        status = "warning"
      }
    }

    // Check squat depth
    if (leftHip && rightHip && leftKnee && rightKnee) {
      const leftLegAngle = this.calculateAngle(leftHip, leftKnee, leftAnkle)
      const rightLegAngle = this.calculateAngle(rightHip, rightKnee, rightAnkle)

      if (leftLegAngle > 160 || rightLegAngle > 160) {
        feedback.push("Lower your body more")
        status = "warning"
      } else if (leftLegAngle < 70 || rightLegAngle < 70) {
        feedback.push("Good depth! Now push back up")
      }
    }

    // Check back alignment
    if (leftShoulder && rightShoulder && leftHip && rightHip) {
      const bodyAngle = this.calculateBodyAngle(leftShoulder, rightShoulder, leftHip, rightHip)
      if (Math.abs(bodyAngle) > 20) {
        feedback.push("Keep your back straight")
        status = "warning"
      }
    }

    if (feedback.length === 0) {
      feedback.push("Perfect squat form!")
    }

    return { status, feedback, confidence }
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

  calculateBodyAngle(leftShoulder, rightShoulder, leftHip, rightHip) {
    const shoulderMidpoint = {
      x: (leftShoulder.x + rightShoulder.x) / 2,
      y: (leftShoulder.y + rightShoulder.y) / 2,
    }
    const hipMidpoint = {
      x: (leftHip.x + rightHip.x) / 2,
      y: (leftHip.y + rightHip.y) / 2,
    }

    const angle = (Math.atan2(hipMidpoint.y - shoulderMidpoint.y, hipMidpoint.x - shoulderMidpoint.x) * 180) / Math.PI

    return angle - 90 // Normalize to vertical
  }

  getHighlightedJoints(analysis) {
    const highlighted = []

    if (analysis.status === "warning" || analysis.status === "error") {
      // Highlight problematic joints based on feedback and exercise type
      analysis.feedback.forEach((feedback) => {
        if (feedback.includes("shoulders")) {
          highlighted.push("left_shoulder", "right_shoulder")
        }
        if (
          feedback.includes("arm") ||
          feedback.includes("elbow") ||
          feedback.includes("wrist") ||
          feedback.includes("curl")
        ) {
          highlighted.push("left_elbow", "right_elbow", "left_wrist", "right_wrist")
        }
        if (feedback.includes("body") || feedback.includes("straight") || feedback.includes("back")) {
          highlighted.push("left_hip", "right_hip")
        }
        if (feedback.includes("knee") || feedback.includes("squat")) {
          highlighted.push("left_knee", "right_knee", "left_ankle", "right_ankle")
        }
      })
    }

    return highlighted
  }
}

// Make class globally available
window.PoseDetector = PoseDetector
