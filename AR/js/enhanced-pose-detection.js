/**
 * Enhanced Pose Detection Module
 * Uses MediaPipe BlazePose for 3D pose detection with AR Fitness app
 */

class EnhancedPoseDetector {
    constructor() {
        this.blazepose = null
        this.isInitialized = false
        this.currentExercise = null
        
        // Detection settings for BlazePose
        this.minPoseConfidence = 0.5
        this.minPartConfidence = 0.5
        
        // BlazePose configuration
        this.blazeposeConfig = {
            modelComplexity: 1, // 0, 1, or 2
            smoothLandmarks: true,
            enableSegmentation: false,
            smoothSegmentation: false,
            minDetectionConfidence: 0.5,
            minTrackingConfidence: 0.5
        }
        
        // Callbacks
        this.onPoseDetected = null
        this.onFaceDetected = null
        this.onRepDetected = null
        
        // Rep counting
        this.repCounter = new RepCounter()
        
        // Smoothing for pose data
        this.poseHistory = []
        this.maxHistoryLength = 5
        
        // Video element reference
        this.videoElement = null
    }
    
    async initialize() {
        try {
            console.log('Initializing Enhanced Pose Detector with BlazePose...')
            
            // Wait for MediaPipe Pose to be available
            if (typeof Pose === 'undefined') {
                console.warn("MediaPipe Pose not loaded yet, retrying...")
                await new Promise(resolve => setTimeout(resolve, 1000))
                return this.initialize()
            }
            
            // Load BlazePose model
            console.log('Loading BlazePose model...')
            this.blazepose = new Pose({
                locateFile: (file) => {
                    return `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`
                }
            })
            
            // Configure BlazePose
            this.blazepose.setOptions(this.blazeposeConfig)
            
            this.isInitialized = true
            console.log('Enhanced Pose Detector initialized successfully with BlazePose')
            
        } catch (error) {
            console.error('Failed to initialize Enhanced Pose Detector:', error)
            throw error
        }
    }
    
    async detectPose(videoElement) {
        if (!this.isInitialized || !videoElement) {
            return null
        }
        
        this.videoElement = videoElement
        
        try {
            // Create a promise to handle the async pose detection
            const result = await new Promise((resolve, reject) => {
                // Set up one-time result handler
                const onResults = (results) => {
                    if (!results || !results.poseLandmarks) {
                        resolve(null)
                        return
                    }
                    
                    // Process the pose
                    const processedPose = this.processPose(results)
                    resolve({ pose: processedPose, rawResults: results })
                }
                
                // Temporarily set the onResults callback
                this.blazepose.onResults(onResults)
                
                // Send the video frame for detection
                if (videoElement.readyState >= 2) {
                    this.blazepose.send({ image: videoElement })
                        .catch(err => {
                            console.error("Error sending frame to BlazePose:", err)
                            resolve(null)
                        })
                } else {
                    resolve(null)
                }
            })
            
            if (!result || !result.pose) {
                return null
            }
            
            const processedPose = result.pose
            
            // Add to history for smoothing
            this.addToHistory(processedPose)
            
            // Get smoothed pose
            const smoothedPose = this.getSmoothedPose()
            
            // Count reps if exercise is active
            if (this.currentExercise && smoothedPose) {
                const repCount = this.repCounter.countReps(smoothedPose, this.currentExercise)
                if (repCount > this.repCounter.lastRepCount) {
                    this.repCounter.lastRepCount = repCount
                    if (this.onRepDetected) {
                        this.onRepDetected(repCount)
                    }
                }
            }
            
            // Trigger pose callback
            if (smoothedPose && this.onPoseDetected) {
                this.onPoseDetected(smoothedPose)
            }
            
            return {
                pose: smoothedPose,
                face: this.extractFaceData(result.rawResults),
                rawResults: result.rawResults
            }
            
        } catch (error) {
            console.error('Error detecting pose:', error)
            return null
        }
    }
    
    processPose(results) {
        const landmarks = results.poseLandmarks
        const worldLandmarks = results.poseWorldLandmarks
        
        if (!landmarks || landmarks.length === 0) {
            return null
        }
        
        // Convert BlazePose landmarks to keypoints format
        const keypoints = {}
        
        // BlazePose landmark names (using underscore naming for consistency)
        const blazeposeNames = [
            "nose", "left_eye_inner", "left_eye", "left_eye_outer",
            "right_eye_inner", "right_eye", "right_eye_outer",
            "left_ear", "right_ear", "mouth_left", "mouth_right",
            "left_shoulder", "right_shoulder", "left_elbow", "right_elbow",
            "left_wrist", "right_wrist", "left_pinky", "right_pinky",
            "left_index", "right_index", "left_thumb", "right_thumb",
            "left_hip", "right_hip", "left_knee", "right_knee",
            "left_ankle", "right_ankle", "left_heel", "right_heel",
            "left_foot_index", "right_foot_index"
        ]
        
        landmarks.forEach((landmark, index) => {
            const name = blazeposeNames[index]
            const videoWidth = this.videoElement?.videoWidth || 640
            const videoHeight = this.videoElement?.videoHeight || 480
            
            keypoints[name] = {
                x: landmark.x * videoWidth,
                y: landmark.y * videoHeight,
                z: landmark.z || 0,
                score: landmark.visibility || 0.9,
                name: name
            }
        })
        
        // Apply pose animator utilities for better processing if available
        let processedKeypoints = keypoints
        if (typeof PoseAnimatorUtils !== 'undefined') {
            const normalizedKeypoints = PoseAnimatorUtils.normalizeKeypoints(keypoints)
            const filteredKeypoints = PoseAnimatorUtils.filterLowConfidenceKeypoints(normalizedKeypoints, 0.3)
            
            // Apply smoothing if we have previous pose data
            if (this.poseHistory.length > 0) {
                const previousPose = this.poseHistory[this.poseHistory.length - 1]
                processedKeypoints = PoseAnimatorUtils.smoothKeypoints(
                    filteredKeypoints, 
                    previousPose.keypoints, 
                    0.3
                )
            } else {
                processedKeypoints = filteredKeypoints
            }
        }
        
        // Calculate average score
        const scores = Object.values(processedKeypoints).map(kp => kp.score)
        const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length
        
        return {
            keypoints: processedKeypoints,
            score: avgScore,
            rawKeypoints: landmarks,
            worldLandmarks: worldLandmarks,
            isValid: this.isValidPose(processedKeypoints)
        }
    }
    
    isValidPose(keypoints) {
        // Check if enough key points are visible with good confidence
        const criticalPoints = [
            'left_shoulder', 'right_shoulder',
            'left_hip', 'right_hip',
            'left_elbow', 'right_elbow'
        ]
        
        let validCount = 0
        criticalPoints.forEach(pointName => {
            if (keypoints[pointName] && keypoints[pointName].score > 0.3) {
                validCount++
            }
        })
        
        return validCount >= 4 // At least 4 critical points visible
    }
    
    extractFaceData(results) {
        if (!results || !results.poseLandmarks) {
            return null
        }
        
        // BlazePose includes face landmarks (0-10)
        const faceLandmarks = results.poseLandmarks.slice(0, 11)
        
        return {
            landmarks: faceLandmarks,
            confidence: results.poseLandmarks[0]?.visibility || 0
        }
    }
    
    addToHistory(pose) {
        this.poseHistory.push(pose)
        if (this.poseHistory.length > this.maxHistoryLength) {
            this.poseHistory.shift()
        }
    }
    
    getSmoothedPose() {
        if (this.poseHistory.length === 0) return null
        if (this.poseHistory.length === 1) return this.poseHistory[0]
        
        // Simple averaging for smoothing
        const smoothedKeypoints = {}
        const latestPose = this.poseHistory[this.poseHistory.length - 1]
        
        Object.keys(latestPose.keypoints).forEach(part => {
            let sumX = 0, sumY = 0, sumZ = 0, sumScore = 0
            let count = 0
            
            this.poseHistory.forEach(pose => {
                if (pose.keypoints[part]) {
                    sumX += pose.keypoints[part].x
                    sumY += pose.keypoints[part].y
                    sumZ += pose.keypoints[part].z || 0
                    sumScore += pose.keypoints[part].score
                    count++
                }
            })
            
            if (count > 0) {
                smoothedKeypoints[part] = {
                    x: sumX / count,
                    y: sumY / count,
                    z: sumZ / count,
                    score: sumScore / count,
                    name: part
                }
            }
        })
        
        return {
            keypoints: smoothedKeypoints,
            score: latestPose.score,
            rawKeypoints: latestPose.rawKeypoints,
            worldLandmarks: latestPose.worldLandmarks
        }
    }
    
    setExerciseType(exerciseType) {
        this.currentExercise = exerciseType
        this.repCounter.reset()
        console.log(`Exercise type set to: ${exerciseType}`)
    }
    
    reset() {
        this.poseHistory = []
        this.repCounter.reset()
    }
}

/**
 * Rep Counter for different exercises
 * Updated to work with BlazePose keypoint names
 */
class RepCounter {
    constructor() {
        this.lastRepCount = 0
        this.exerciseState = 'neutral'
        this.stateHistory = []
        this.repThreshold = 0.3 // Threshold for state changes
    }
    
    countReps(pose, exerciseType) {
        if (!pose || !pose.keypoints) return this.lastRepCount
        
        switch (exerciseType) {
            case 'Hr Only':
                // No rep counting for HR only mode
                return this.lastRepCount
            case 'bicep-curls':
                return this.countBicepCurls(pose)
            case 'lateral-raises':
                return this.countLateralRaises(pose)
            case 'squats':
                return this.countSquats(pose)
            default:
                return this.lastRepCount
        }
    }
    
    countPushUps(pose) {
        const leftShoulder = pose.keypoints.left_shoulder
        const rightShoulder = pose.keypoints.right_shoulder
        const leftElbow = pose.keypoints.left_elbow
        const rightElbow = pose.keypoints.right_elbow
        
        if (!leftShoulder || !rightShoulder || !leftElbow || !rightElbow) {
            return this.lastRepCount
        }
        
        // Calculate average elbow height relative to shoulders
        const shoulderY = (leftShoulder.y + rightShoulder.y) / 2
        const elbowY = (leftElbow.y + rightElbow.y) / 2
        const relativeHeight = (elbowY - shoulderY) / 100 // Normalize
        
        // State machine for push-up detection
        if (this.exerciseState === 'neutral' && relativeHeight > this.repThreshold) {
            this.exerciseState = 'down'
        } else if (this.exerciseState === 'down' && relativeHeight < -this.repThreshold) {
            this.exerciseState = 'up'
            this.lastRepCount++
            this.exerciseState = 'neutral'
        }
        
        return this.lastRepCount
    }
    
    countBicepCurls(pose) {
        const leftWrist = pose.keypoints.left_wrist
        const leftElbow = pose.keypoints.left_elbow
        const leftShoulder = pose.keypoints.left_shoulder
        
        if (!leftWrist || !leftElbow || !leftShoulder) {
            return this.lastRepCount
        }
        
        // Calculate arm angle
        const armVector = {
            x: leftWrist.x - leftElbow.x,
            y: leftWrist.y - leftElbow.y
        }
        const forearmVector = {
            x: leftElbow.x - leftShoulder.x,
            y: leftElbow.y - leftShoulder.y
        }
        
        // Simple angle approximation
        const angle = Math.atan2(armVector.y, armVector.x) - Math.atan2(forearmVector.y, forearmVector.x)
        const normalizedAngle = Math.abs(angle) / Math.PI
        
        // State machine for bicep curl detection
        if (this.exerciseState === 'neutral' && normalizedAngle > 0.3) {
            this.exerciseState = 'curled'
        } else if (this.exerciseState === 'curled' && normalizedAngle < 0.1) {
            this.exerciseState = 'extended'
            this.lastRepCount++
            this.exerciseState = 'neutral'
        }
        
        return this.lastRepCount
    }
    
    countLateralRaises(pose) {
        const leftWrist = pose.keypoints.left_wrist
        const rightWrist = pose.keypoints.right_wrist
        const leftShoulder = pose.keypoints.left_shoulder
        const rightShoulder = pose.keypoints.right_shoulder
        
        if (!leftWrist || !rightWrist || !leftShoulder || !rightShoulder) {
            return this.lastRepCount
        }
        
        // Calculate average wrist height relative to shoulders
        const shoulderY = (leftShoulder.y + rightShoulder.y) / 2
        const wristY = (leftWrist.y + rightWrist.y) / 2
        const relativeHeight = (shoulderY - wristY) / 100 // Normalize
        
        // State machine for lateral raise detection
        if (this.exerciseState === 'neutral' && relativeHeight > this.repThreshold) {
            this.exerciseState = 'raised'
        } else if (this.exerciseState === 'raised' && relativeHeight < -this.repThreshold) {
            this.exerciseState = 'lowered'
            this.lastRepCount++
            this.exerciseState = 'neutral'
        }
        
        return this.lastRepCount
    }
    
    countSquats(pose) {
        const leftHip = pose.keypoints.left_hip
        const rightHip = pose.keypoints.right_hip
        const leftKnee = pose.keypoints.left_knee
        const rightKnee = pose.keypoints.right_knee
        
        if (!leftHip || !rightHip || !leftKnee || !rightKnee) {
            return this.lastRepCount
        }
        
        // Calculate average hip-knee distance
        const hipY = (leftHip.y + rightHip.y) / 2
        const kneeY = (leftKnee.y + rightKnee.y) / 2
        const hipKneeDistance = (kneeY - hipY) / 100 // Normalize
        
        // State machine for squat detection
        if (this.exerciseState === 'neutral' && hipKneeDistance < -this.repThreshold) {
            this.exerciseState = 'down'
        } else if (this.exerciseState === 'down' && hipKneeDistance > this.repThreshold) {
            this.exerciseState = 'up'
            this.lastRepCount++
            this.exerciseState = 'neutral'
        }
        
        return this.lastRepCount
    }
    
    reset() {
        this.lastRepCount = 0
        this.exerciseState = 'neutral'
        this.stateHistory = []
    }
}

// Make available globally
window.EnhancedPoseDetector = EnhancedPoseDetector
window.RepCounter = RepCounter
