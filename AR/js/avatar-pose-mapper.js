/**
 * Avatar Pose Mapper
 * Maps pose detection data to 3D avatar movements
 * Integrates pose-animator's bone transformation logic with 3D avatar system
 */

class AvatarPoseMapper {
    constructor() {
        this.isInitialized = false;
        this.smoothingFactor = 0.3;
        this.scaleFactor = 1.0;
        
        // Bone mapping from pose keypoints to 3D avatar bones
        this.boneMapping = {
            // Head and neck
            'head': ['head', 'neck'],
            'nose': ['head'],
            
            // Torso
            'left_shoulder': ['torso', 'leftUpperArm'],
            'right_shoulder': ['torso', 'rightUpperArm'],
            
            // Arms
            'left_elbow': ['leftForearm'],
            'right_elbow': ['rightForearm'],
            'left_wrist': ['leftHand'],
            'right_wrist': ['rightHand'],
            
            // Hips and legs
            'left_hip': ['hips', 'leftThigh'],
            'right_hip': ['hips', 'rightThigh'],
            'left_knee': ['leftShin'],
            'right_knee': ['rightShin'],
            'left_ankle': ['leftFoot'],
            'right_ankle': ['rightFoot']
        };
        
        // Reference positions for normalization
        this.referencePositions = {
            shoulderWidth: 100,
            torsoHeight: 150,
            armLength: 120,
            legLength: 180
        };
        
        // Previous pose for smoothing
        this.previousPose = null;
        
        this.initialize();
    }
    
    initialize() {
        console.log('Avatar Pose Mapper initialized');
        this.isInitialized = true;
    }
    
    /**
     * Maps pose keypoints to 3D avatar transformations
     * @param {Object} poseData - Pose detection data with keypoints
     * @param {Object} avatar3D - 3D avatar instance (SideAvatar3D)
     */
    mapPoseToAvatar(poseData, avatar3D) {
        if (!this.isInitialized || !poseData || !poseData.keypoints || !avatar3D) {
            return;
        }
        
        const keypoints = poseData.keypoints;
        
        // Calculate body proportions for scaling
        const bodyProportions = this.calculateBodyProportions(keypoints);
        
        // Map each keypoint to avatar bones
        this.mapHeadAndNeck(keypoints, avatar3D, bodyProportions);
        this.mapTorso(keypoints, avatar3D, bodyProportions);
        this.mapArms(keypoints, avatar3D, bodyProportions);
        this.mapLegs(keypoints, avatar3D, bodyProportions);
        
        // Store for next frame smoothing
        this.previousPose = poseData;
    }
    
    calculateBodyProportions(keypoints) {
        const proportions = {
            shoulderWidth: this.referencePositions.shoulderWidth,
            torsoHeight: this.referencePositions.torsoHeight,
            scale: 1.0
        };
        
        // Calculate shoulder width if both shoulders are visible
        if (keypoints.left_shoulder && keypoints.right_shoulder) {
            const shoulderDistance = Math.sqrt(
                Math.pow(keypoints.right_shoulder.x - keypoints.left_shoulder.x, 2) +
                Math.pow(keypoints.right_shoulder.y - keypoints.left_shoulder.y, 2)
            );
            proportions.shoulderWidth = shoulderDistance;
            proportions.scale = shoulderDistance / this.referencePositions.shoulderWidth;
        }
        
        // Calculate torso height if shoulders and hips are visible
        if (keypoints.left_shoulder && keypoints.right_shoulder && 
            keypoints.left_hip && keypoints.right_hip) {
            const shoulderY = (keypoints.left_shoulder.y + keypoints.right_shoulder.y) / 2;
            const hipY = (keypoints.left_hip.y + keypoints.right_hip.y) / 2;
            proportions.torsoHeight = Math.abs(hipY - shoulderY);
        }
        
        return proportions;
    }
    
    mapHeadAndNeck(keypoints, avatar3D, proportions) {
        // Map head position
        if (keypoints.nose && avatar3D.bones.head) {
            const headPos = this.normalizePosition(keypoints.nose, proportions);
            
            // Apply smoothing
            const smoothedPos = this.smoothPosition(
                avatar3D.bones.head.position,
                { x: headPos.x, y: headPos.y + 1.6, z: 0 }
            );
            
            avatar3D.bones.head.position.set(smoothedPos.x, smoothedPos.y, smoothedPos.z);
            
            // Add head rotation based on pose
            if (keypoints.left_ear && keypoints.right_ear) {
                const earDiff = keypoints.right_ear.x - keypoints.left_ear.x;
                const headRotation = (earDiff / proportions.shoulderWidth) * 0.5;
                avatar3D.bones.head.rotation.z = this.smoothRotation(
                    avatar3D.bones.head.rotation.z,
                    headRotation
                );
            }
        }
    }
    
    mapTorso(keypoints, avatar3D, proportions) {
        // Map torso position and rotation
        if (keypoints.left_shoulder && keypoints.right_shoulder && avatar3D.bones.torso) {
            const shoulderCenter = {
                x: (keypoints.left_shoulder.x + keypoints.right_shoulder.x) / 2,
                y: (keypoints.left_shoulder.y + keypoints.right_shoulder.y) / 2
            };
            
            const torsoPos = this.normalizePosition(shoulderCenter, proportions);
            const smoothedPos = this.smoothPosition(
                avatar3D.bones.torso.position,
                { x: torsoPos.x, y: torsoPos.y + 0.9, z: 0 }
            );
            
            avatar3D.bones.torso.position.set(smoothedPos.x, smoothedPos.y, smoothedPos.z);
            
            // Calculate torso rotation from shoulder angle
            const shoulderAngle = Math.atan2(
                keypoints.right_shoulder.y - keypoints.left_shoulder.y,
                keypoints.right_shoulder.x - keypoints.left_shoulder.x
            );
            
            avatar3D.bones.torso.rotation.z = this.smoothRotation(
                avatar3D.bones.torso.rotation.z,
                shoulderAngle * 0.3
            );
        }
    }
    
    mapArms(keypoints, avatar3D, proportions) {
        // Map left arm
        this.mapArm('left', keypoints, avatar3D, proportions);
        
        // Map right arm
        this.mapArm('right', keypoints, avatar3D, proportions);
    }
    
    mapArm(side, keypoints, avatar3D, proportions) {
        const shoulder = keypoints[`${side}Shoulder`];
        const elbow = keypoints[`${side}Elbow`];
        const wrist = keypoints[`${side}Wrist`];
        
        const upperArm = avatar3D.bones[`${side}UpperArm`];
        const forearm = avatar3D.bones[`${side}Forearm`];
        const hand = avatar3D.bones[`${side}Hand`];
        
        if (shoulder && elbow && upperArm) {
            // Calculate upper arm angle
            const upperArmAngle = Math.atan2(
                elbow.y - shoulder.y,
                elbow.x - shoulder.x
            );
            
            // Apply to upper arm rotation
            const targetRotation = upperArmAngle + (side === 'left' ? Math.PI/6 : -Math.PI/6);
            upperArm.rotation.z = this.smoothRotation(upperArm.rotation.z, targetRotation);
            
            // Position upper arm
            const upperArmPos = this.normalizePosition(shoulder, proportions);
            const smoothedPos = this.smoothPosition(
                upperArm.position,
                { 
                    x: upperArmPos.x + (side === 'left' ? -0.25 : 0.25), 
                    y: upperArmPos.y + 1.1, 
                    z: 0 
                }
            );
            upperArm.position.set(smoothedPos.x, smoothedPos.y, smoothedPos.z);
        }
        
        if (elbow && wrist && forearm) {
            // Calculate forearm angle
            const forearmAngle = Math.atan2(
                wrist.y - elbow.y,
                wrist.x - elbow.x
            );
            
            // Apply to forearm rotation
            const targetRotation = forearmAngle + (side === 'left' ? Math.PI/4 : -Math.PI/4);
            forearm.rotation.z = this.smoothRotation(forearm.rotation.z, targetRotation);
            
            // Position forearm
            const forearmPos = this.normalizePosition(elbow, proportions);
            const smoothedPos = this.smoothPosition(
                forearm.position,
                { 
                    x: forearmPos.x + (side === 'left' ? -0.4 : 0.4), 
                    y: forearmPos.y + 0.8, 
                    z: 0 
                }
            );
            forearm.position.set(smoothedPos.x, smoothedPos.y, smoothedPos.z);
        }
        
        if (wrist && hand) {
            // Position hand
            const handPos = this.normalizePosition(wrist, proportions);
            const smoothedPos = this.smoothPosition(
                hand.position,
                { 
                    x: handPos.x + (side === 'left' ? -0.55 : 0.55), 
                    y: handPos.y + 0.5, 
                    z: 0 
                }
            );
            hand.position.set(smoothedPos.x, smoothedPos.y, smoothedPos.z);
        }
    }
    
    mapLegs(keypoints, avatar3D, proportions) {
        // Map left leg
        this.mapLeg('left', keypoints, avatar3D, proportions);
        
        // Map right leg
        this.mapLeg('right', keypoints, avatar3D, proportions);
    }
    
    mapLeg(side, keypoints, avatar3D, proportions) {
        const hip = keypoints[`${side}Hip`];
        const knee = keypoints[`${side}Knee`];
        const ankle = keypoints[`${side}Ankle`];
        
        const thigh = avatar3D.bones[`${side}Thigh`];
        const shin = avatar3D.bones[`${side}Shin`];
        const foot = avatar3D.bones[`${side}Foot`];
        
        if (hip && knee && thigh) {
            // Calculate thigh angle
            const thighAngle = Math.atan2(
                knee.y - hip.y,
                knee.x - hip.x
            );
            
            // Apply to thigh rotation
            thigh.rotation.z = this.smoothRotation(thigh.rotation.z, thighAngle * 0.3);
            
            // Position thigh
            const thighPos = this.normalizePosition(hip, proportions);
            const smoothedPos = this.smoothPosition(
                thigh.position,
                { 
                    x: thighPos.x + (side === 'left' ? -0.1 : 0.1), 
                    y: thighPos.y, 
                    z: 0 
                }
            );
            thigh.position.set(smoothedPos.x, smoothedPos.y, smoothedPos.z);
        }
        
        if (knee && ankle && shin) {
            // Calculate shin angle
            const shinAngle = Math.atan2(
                ankle.y - knee.y,
                ankle.x - knee.x
            );
            
            // Apply to shin rotation
            shin.rotation.z = this.smoothRotation(shin.rotation.z, shinAngle * 0.3);
            
            // Position shin
            const shinPos = this.normalizePosition(knee, proportions);
            const smoothedPos = this.smoothPosition(
                shin.position,
                { 
                    x: shinPos.x + (side === 'left' ? -0.1 : 0.1), 
                    y: shinPos.y - 0.4, 
                    z: 0 
                }
            );
            shin.position.set(smoothedPos.x, smoothedPos.y, smoothedPos.z);
        }
        
        if (ankle && foot) {
            // Position foot
            const footPos = this.normalizePosition(ankle, proportions);
            const smoothedPos = this.smoothPosition(
                foot.position,
                { 
                    x: footPos.x + (side === 'left' ? -0.1 : 0.1), 
                    y: footPos.y - 0.8, 
                    z: 0.08 
                }
            );
            foot.position.set(smoothedPos.x, smoothedPos.y, smoothedPos.z);
        }
    }
    
    normalizePosition(keypoint, proportions) {
        // Normalize keypoint position to avatar coordinate system
        return {
            x: (keypoint.x - 320) / 320 * proportions.scale * 0.5, // Assuming 640px width
            y: -(keypoint.y - 240) / 240 * proportions.scale * 0.5  // Assuming 480px height, flip Y
        };
    }
    
    smoothPosition(currentPos, targetPos) {
        return {
            x: currentPos.x + (targetPos.x - currentPos.x) * this.smoothingFactor,
            y: currentPos.y + (targetPos.y - currentPos.y) * this.smoothingFactor,
            z: currentPos.z + (targetPos.z - currentPos.z) * this.smoothingFactor
        };
    }
    
    smoothRotation(currentRot, targetRot) {
        return currentRot + (targetRot - currentRot) * this.smoothingFactor;
    }
    
    reset() {
        this.previousPose = null;
    }
}

// Make available globally
window.AvatarPoseMapper = AvatarPoseMapper;

