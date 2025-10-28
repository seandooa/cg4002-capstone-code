/**
 * Pose Animator Utilities
 * Utility functions adapted from pose-animator for better pose processing
 */

class PoseAnimatorUtils {
    static flipPose(pose) {
        // Flip pose horizontally (from pose-animator's skeleton.js)
        if (!pose || !pose.keypoints) return pose;
        
        pose.keypoints.forEach(keypoint => {
            // Flip x coordinate (assuming 640px width)
            keypoint.position.x = 640 - keypoint.position.x;
        });
        
        return pose;
    }
    
    static toFaceFrame(faceDetection) {
        // Convert face detection to face frame format (from pose-animator)
        if (!faceDetection || !faceDetection.scaledMesh) return null;
        
        const positions = [];
        faceDetection.scaledMesh.forEach(point => {
            positions.push(point[0], point[1]); // x, y coordinates
        });
        
        return {
            positions: positions,
            scaledMesh: faceDetection.scaledMesh,
            boundingBox: faceDetection.boundingBox
        };
    }
    
    static getCurrentPosition(point) {
        // Get current position for skinned point (adapted from pose-animator)
        if (!point || !point.skinning) return point.position;
        
        let currentPos = { x: 0, y: 0 };
        let totalWeight = 0;
        
        Object.keys(point.skinning).forEach(boneName => {
            const skinData = point.skinning[boneName];
            if (skinData.bone && skinData.weight) {
                const bonePos = skinData.bone.transform(skinData.transform);
                if (bonePos) {
                    currentPos.x += bonePos.x * skinData.weight;
                    currentPos.y += bonePos.y * skinData.weight;
                    totalWeight += skinData.weight;
                }
            }
        });
        
        if (totalWeight > 0) {
            currentPos.x /= totalWeight;
            currentPos.y /= totalWeight;
        }
        
        return currentPos;
    }
    
    static normalizeKeypoints(keypoints, videoWidth = 640, videoHeight = 480) {
        // Normalize keypoints to -1 to 1 range
        const normalized = {};
        
        Object.keys(keypoints).forEach(name => {
            const kp = keypoints[name];
            if (kp) {
                normalized[name] = {
                    x: (kp.x / videoWidth) * 2 - 1,
                    y: (kp.y / videoHeight) * 2 - 1,
                    score: kp.score,
                    name: kp.name
                };
            }
        });
        
        return normalized;
    }
    
    static smoothKeypoints(currentKeypoints, previousKeypoints, smoothingFactor = 0.3) {
        // Smooth keypoints over time
        if (!previousKeypoints) return currentKeypoints;
        
        const smoothed = {};
        
        Object.keys(currentKeypoints).forEach(name => {
            const current = currentKeypoints[name];
            const previous = previousKeypoints[name];
            
            if (current && previous) {
                smoothed[name] = {
                    x: previous.x + (current.x - previous.x) * smoothingFactor,
                    y: previous.y + (current.y - previous.y) * smoothingFactor,
                    score: Math.max(current.score, previous.score * 0.9), // Decay previous score
                    name: current.name
                };
            } else if (current) {
                smoothed[name] = { ...current };
            }
        });
        
        return smoothed;
    }
    
    static calculateBoneLength(keypoint1, keypoint2) {
        // Calculate distance between two keypoints
        if (!keypoint1 || !keypoint2) return 0;
        
        const dx = keypoint2.x - keypoint1.x;
        const dy = keypoint2.y - keypoint1.y;
        return Math.sqrt(dx * dx + dy * dy);
    }
    
    static calculateAngle(keypoint1, keypoint2, keypoint3) {
        // Calculate angle at keypoint2 formed by keypoint1-keypoint2-keypoint3
        if (!keypoint1 || !keypoint2 || !keypoint3) return 0;
        
        const v1 = { x: keypoint1.x - keypoint2.x, y: keypoint1.y - keypoint2.y };
        const v2 = { x: keypoint3.x - keypoint2.x, y: keypoint3.y - keypoint2.y };
        
        const dot = v1.x * v2.x + v1.y * v2.y;
        const mag1 = Math.sqrt(v1.x * v1.x + v1.y * v1.y);
        const mag2 = Math.sqrt(v2.x * v2.x + v2.y * v2.y);
        
        if (mag1 === 0 || mag2 === 0) return 0;
        
        const cosAngle = dot / (mag1 * mag2);
        return Math.acos(Math.max(-1, Math.min(1, cosAngle)));
    }
    
    static isValidPose(pose, minConfidence = 0.3) {
        // Check if pose has enough valid keypoints
        if (!pose || !pose.keypoints) return false;
        
        const validKeypoints = Object.values(pose.keypoints).filter(kp => 
            kp && kp.score >= minConfidence
        );
        
        // Need at least 5 valid keypoints for a reasonable pose
        return validKeypoints.length >= 5;
    }
    
    static getBodyCenter(keypoints) {
        // Calculate center point of the body
        const centerKeypoints = ['leftShoulder', 'rightShoulder', 'leftHip', 'rightHip'];
        let centerX = 0, centerY = 0, count = 0;
        
        centerKeypoints.forEach(name => {
            const kp = keypoints[name];
            if (kp && kp.score > 0.3) {
                centerX += kp.x;
                centerY += kp.y;
                count++;
            }
        });
        
        if (count === 0) return null;
        
        return {
            x: centerX / count,
            y: centerY / count
        };
    }
    
    static scaleKeypointsToAvatar(keypoints, avatarBounds) {
        // Scale keypoints to fit avatar coordinate system
        const bodyCenter = this.getBodyCenter(keypoints);
        if (!bodyCenter) return keypoints;
        
        const scaled = {};
        const scale = avatarBounds.scale || 1.0;
        const offset = avatarBounds.offset || { x: 0, y: 0 };
        
        Object.keys(keypoints).forEach(name => {
            const kp = keypoints[name];
            if (kp) {
                scaled[name] = {
                    x: (kp.x - bodyCenter.x) * scale + offset.x,
                    y: (kp.y - bodyCenter.y) * scale + offset.y,
                    score: kp.score,
                    name: kp.name
                };
            }
        });
        
        return scaled;
    }
    
    static filterLowConfidenceKeypoints(keypoints, minConfidence = 0.3) {
        // Filter out keypoints with low confidence
        const filtered = {};
        
        Object.keys(keypoints).forEach(name => {
            const kp = keypoints[name];
            if (kp && kp.score >= minConfidence) {
                filtered[name] = kp;
            }
        });
        
        return filtered;
    }
    
    static interpolateKeypoints(keypoints1, keypoints2, factor) {
        // Interpolate between two sets of keypoints
        const interpolated = {};
        
        Object.keys(keypoints1).forEach(name => {
            const kp1 = keypoints1[name];
            const kp2 = keypoints2[name];
            
            if (kp1 && kp2) {
                interpolated[name] = {
                    x: kp1.x + (kp2.x - kp1.x) * factor,
                    y: kp1.y + (kp2.y - kp1.y) * factor,
                    score: Math.max(kp1.score, kp2.score),
                    name: kp1.name
                };
            } else if (kp1) {
                interpolated[name] = { ...kp1 };
            } else if (kp2) {
                interpolated[name] = { ...kp2 };
            }
        });
        
        return interpolated;
    }
}

// Make available globally
window.PoseAnimatorUtils = PoseAnimatorUtils;

