/**
 * Enhanced Side Avatar 3D
 * Improved version with better pose mapping, error handling, and performance
 */

class EnhancedSideAvatar3D {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.avatar = null;
        this.bones = {};
        this.isInitialized = false;
        this.currentView = 'side';
        this.avatarType = 'humanoid';
        
        // Avatar settings
        this.avatarScale = 0.8;
        this.avatarPosition = { x: 0, y: -0.3, z: 0 };
        
        // Animation properties
        this.animationId = null;
        this.currentPoseData = null;
        this.smoothingFactor = 0.15; // Reduced for more responsive movement
        this.time = 0;
        
        // Pose mapping configuration
        this.poseMapping = {
            // Map pose keypoints to avatar bone transformations
            head: { bone: 'head', scale: 1.0, offset: { x: 0, y: 1.6, z: 0 } },
            neck: { bone: 'neck', scale: 1.0, offset: { x: 0, y: 1.4, z: 0 } },
            leftShoulder: { bone: 'leftUpperArm', scale: 0.8, offset: { x: -0.25, y: 1.1, z: 0 } },
            rightShoulder: { bone: 'rightUpperArm', scale: 0.8, offset: { x: 0.25, y: 1.1, z: 0 } },
            leftElbow: { bone: 'leftForearm', scale: 0.8, offset: { x: -0.4, y: 0.8, z: 0 } },
            rightElbow: { bone: 'rightForearm', scale: 0.8, offset: { x: 0.4, y: 0.8, z: 0 } },
            leftWrist: { bone: 'leftHand', scale: 0.8, offset: { x: -0.55, y: 0.5, z: 0 } },
            rightWrist: { bone: 'rightHand', scale: 0.8, offset: { x: 0.55, y: 0.5, z: 0 } },
            leftHip: { bone: 'leftThigh', scale: 0.8, offset: { x: -0.1, y: 0.0, z: 0 } },
            rightHip: { bone: 'rightThigh', scale: 0.8, offset: { x: 0.1, y: 0.0, z: 0 } },
            leftKnee: { bone: 'leftShin', scale: 0.8, offset: { x: -0.1, y: -0.4, z: 0 } },
            rightKnee: { bone: 'rightShin', scale: 0.8, offset: { x: 0.1, y: -0.4, z: 0 } },
            leftAnkle: { bone: 'leftFoot', scale: 0.8, offset: { x: -0.1, y: -0.8, z: 0.08 } },
            rightAnkle: { bone: 'rightFoot', scale: 0.8, offset: { x: 0.1, y: -0.8, z: 0.08 } }
        };
        
        // Original transforms for reset
        this.originalTransforms = {};
        
        // Performance monitoring
        this.lastUpdateTime = 0;
        this.updateInterval = 16; // ~60 FPS
        
        this.initialize();
    }
    
    initialize() {
        if (!this.canvas) {
            console.error("Enhanced Avatar canvas not found");
            return;
        }
        
        try {
            this.setupScene();
            this.setupLighting();
            this.createEnhancedAvatar();
            this.setupEventListeners();
            
            this.isInitialized = true;
            this.startRenderLoop();
            
            console.log("Enhanced Side Avatar 3D initialized successfully");
        } catch (error) {
            console.error("Failed to initialize Enhanced Side Avatar 3D:", error);
        }
    }
    
    setupScene() {
        // Create scene with better settings
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x1a1a1a);
        this.scene.fog = new THREE.Fog(0x1a1a1a, 5, 15);
        
        // Create camera for side view with better positioning
        this.camera = new THREE.PerspectiveCamera(
            60, // Reduced FOV for less distortion
            this.canvas.clientWidth / this.canvas.clientHeight,
            0.1,
            1000
        );
        this.setCameraView('side');
        
        // Create renderer with better settings
        this.renderer = new THREE.WebGLRenderer({
            canvas: this.canvas,
            alpha: true,
            antialias: true,
            powerPreference: "high-performance"
        });
        this.renderer.setSize(this.canvas.clientWidth, this.canvas.clientHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.renderer.outputEncoding = THREE.sRGBEncoding;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.2;
    }
    
    setupLighting() {
        // Ambient light
        const ambientLight = new THREE.AmbientLight(0x404040, 0.6);
        this.scene.add(ambientLight);
        
        // Main directional light from side
        const directionalLight = new THREE.DirectionalLight(0xffffff, 1.0);
        directionalLight.position.set(3, 5, 2);
        directionalLight.castShadow = true;
        directionalLight.shadow.mapSize.width = 2048;
        directionalLight.shadow.mapSize.height = 2048;
        directionalLight.shadow.camera.near = 0.5;
        directionalLight.shadow.camera.far = 50;
        directionalLight.shadow.camera.left = -5;
        directionalLight.shadow.camera.right = 5;
        directionalLight.shadow.camera.top = 5;
        directionalLight.shadow.camera.bottom = -5;
        this.scene.add(directionalLight);
        
        // Fill light for better visibility
        const fillLight = new THREE.DirectionalLight(0x00ff88, 0.4);
        fillLight.position.set(-3, 2, -2);
        this.scene.add(fillLight);
        
        // Rim light for better definition
        const rimLight = new THREE.DirectionalLight(0x88ccff, 0.3);
        rimLight.position.set(0, 3, -3);
        this.scene.add(rimLight);
        
        // Ground plane with better material
        const groundGeometry = new THREE.PlaneGeometry(10, 10);
        const groundMaterial = new THREE.MeshLambertMaterial({ 
            color: 0x333333,
            transparent: true,
            opacity: 0.3
        });
        const ground = new THREE.Mesh(groundGeometry, groundMaterial);
        ground.rotation.x = -Math.PI / 2;
        ground.position.y = -1.5;
        ground.receiveShadow = true;
        this.scene.add(ground);
    }
    
    createEnhancedAvatar() {
        this.avatar = new THREE.Group();
        this.createImprovedHumanoidFigure();
        
        // Position and scale avatar
        this.avatar.position.set(
            this.avatarPosition.x,
            this.avatarPosition.y,
            this.avatarPosition.z
        );
        this.avatar.scale.setScalar(this.avatarScale);
        
        this.scene.add(this.avatar);
        
        // Store original transforms after creation
        setTimeout(() => this.storeOriginalTransforms(), 100);
    }
    
    createImprovedHumanoidFigure() {
        // Enhanced materials with better appearance
        const bodyMaterial = new THREE.MeshPhongMaterial({ 
            color: 0x00ff88,
            transparent: true,
            opacity: 0.9,
            shininess: 30,
            specular: 0x111111
        });
        
        const jointMaterial = new THREE.MeshPhongMaterial({ 
            color: 0x00cc66,
            transparent: true,
            opacity: 0.8,
            shininess: 50
        });
        
        // Head with better proportions
        const head = new THREE.Mesh(
            new THREE.SphereGeometry(0.12, 16, 16),
            bodyMaterial
        );
        head.position.set(0, 1.6, 0);
        head.castShadow = true;
        this.avatar.add(head);
        this.bones.head = head;
        
        // Neck
        const neck = new THREE.Mesh(
            new THREE.CylinderGeometry(0.04, 0.06, 0.12, 8),
            bodyMaterial
        );
        neck.position.set(0, 1.45, 0);
        neck.castShadow = true;
        this.avatar.add(neck);
        this.bones.neck = neck;
        
        // Torso with better shape
        const torso = new THREE.Mesh(
            new THREE.CylinderGeometry(0.15, 0.18, 0.6, 8),
            bodyMaterial
        );
        torso.position.set(0, 1.0, 0);
        torso.castShadow = true;
        this.avatar.add(torso);
        this.bones.torso = torso;
        
        // Shoulders as connection points
        const leftShoulder = new THREE.Mesh(
            new THREE.SphereGeometry(0.06, 8, 8),
            jointMaterial
        );
        leftShoulder.position.set(-0.2, 1.2, 0);
        leftShoulder.castShadow = true;
        this.avatar.add(leftShoulder);
        this.bones.leftShoulder = leftShoulder;
        
        const rightShoulder = new THREE.Mesh(
            new THREE.SphereGeometry(0.06, 8, 8),
            jointMaterial
        );
        rightShoulder.position.set(0.2, 1.2, 0);
        rightShoulder.castShadow = true;
        this.avatar.add(rightShoulder);
        this.bones.rightShoulder = rightShoulder;
        
        // Arms with better articulation
        this.createArm('left', bodyMaterial, jointMaterial);
        this.createArm('right', bodyMaterial, jointMaterial);
        
        // Hips
        const hips = new THREE.Mesh(
            new THREE.CylinderGeometry(0.12, 0.15, 0.15, 8),
            bodyMaterial
        );
        hips.position.set(0, 0.5, 0);
        hips.castShadow = true;
        this.avatar.add(hips);
        this.bones.hips = hips;
        
        // Legs with better articulation
        this.createLeg('left', bodyMaterial, jointMaterial);
        this.createLeg('right', bodyMaterial, jointMaterial);
    }
    
    createArm(side, bodyMaterial, jointMaterial) {
        const sign = side === 'left' ? -1 : 1;
        
        // Upper arm
        const upperArm = new THREE.Mesh(
            new THREE.CylinderGeometry(0.035, 0.04, 0.3, 8),
            bodyMaterial
        );
        upperArm.position.set(sign * 0.25, 1.05, 0);
        upperArm.rotation.z = sign * Math.PI / 8;
        upperArm.castShadow = true;
        this.avatar.add(upperArm);
        this.bones[`${side}UpperArm`] = upperArm;
        
        // Elbow joint
        const elbow = new THREE.Mesh(
            new THREE.SphereGeometry(0.04, 8, 8),
            jointMaterial
        );
        elbow.position.set(sign * 0.35, 0.85, 0);
        elbow.castShadow = true;
        this.avatar.add(elbow);
        this.bones[`${side}Elbow`] = elbow;
        
        // Forearm
        const forearm = new THREE.Mesh(
            new THREE.CylinderGeometry(0.03, 0.035, 0.28, 8),
            bodyMaterial
        );
        forearm.position.set(sign * 0.45, 0.65, 0);
        forearm.rotation.z = sign * Math.PI / 6;
        forearm.castShadow = true;
        this.avatar.add(forearm);
        this.bones[`${side}Forearm`] = forearm;
        
        // Hand
        const hand = new THREE.Mesh(
            new THREE.SphereGeometry(0.05, 8, 8),
            jointMaterial
        );
        hand.position.set(sign * 0.55, 0.45, 0);
        hand.castShadow = true;
        this.avatar.add(hand);
        this.bones[`${side}Hand`] = hand;
    }
    
    createLeg(side, bodyMaterial, jointMaterial) {
        const sign = side === 'left' ? -1 : 1;
        
        // Thigh
        const thigh = new THREE.Mesh(
            new THREE.CylinderGeometry(0.05, 0.06, 0.35, 8),
            bodyMaterial
        );
        thigh.position.set(sign * 0.08, 0.15, 0);
        thigh.castShadow = true;
        this.avatar.add(thigh);
        this.bones[`${side}Thigh`] = thigh;
        
        // Knee joint
        const knee = new THREE.Mesh(
            new THREE.SphereGeometry(0.045, 8, 8),
            jointMaterial
        );
        knee.position.set(sign * 0.08, -0.15, 0);
        knee.castShadow = true;
        this.avatar.add(knee);
        this.bones[`${side}Knee`] = knee;
        
        // Shin
        const shin = new THREE.Mesh(
            new THREE.CylinderGeometry(0.04, 0.05, 0.32, 8),
            bodyMaterial
        );
        shin.position.set(sign * 0.08, -0.4, 0);
        shin.castShadow = true;
        this.avatar.add(shin);
        this.bones[`${side}Shin`] = shin;
        
        // Foot
        const foot = new THREE.Mesh(
            new THREE.BoxGeometry(0.08, 0.03, 0.2),
            bodyMaterial
        );
        foot.position.set(sign * 0.08, -0.65, 0.06);
        foot.castShadow = true;
        this.avatar.add(foot);
        this.bones[`${side}Foot`] = foot;
    }
    
    storeOriginalTransforms() {
        Object.keys(this.bones).forEach(boneName => {
            const bone = this.bones[boneName];
            if (bone) {
                this.originalTransforms[boneName] = {
                    position: bone.position.clone(),
                    rotation: bone.rotation.clone(),
                    scale: bone.scale.clone()
                };
            }
        });
        console.log('Original transforms stored for avatar reset');
    }
    
    setupEventListeners() {
        // Handle window resize
        window.addEventListener('resize', () => this.handleResize());
        
        // Handle visibility change for performance
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                this.pauseRendering();
            } else {
                this.resumeRendering();
            }
        });
    }
    
    handleResize() {
        if (!this.camera || !this.renderer || !this.canvas) return;
        
        const width = this.canvas.clientWidth;
        const height = this.canvas.clientHeight;
        
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(width, height);
    }
    
    setCameraView(view) {
        this.currentView = view;
        
        switch (view) {
            case 'side':
                this.camera.position.set(2.5, 0.5, 0);
                this.camera.lookAt(0, 0.5, 0);
                break;
            case 'front':
                this.camera.position.set(0, 0.5, 2.5);
                this.camera.lookAt(0, 0.5, 0);
                break;
            case 'perspective':
                this.camera.position.set(2, 1.5, 2);
                this.camera.lookAt(0, 0.5, 0);
                break;
        }
    }
    
    updatePose(poseData) {
        if (!this.isInitialized || !poseData || !poseData.keypoints) return;
        
        const currentTime = Date.now();
        if (currentTime - this.lastUpdateTime < this.updateInterval) return;
        
        this.currentPoseData = poseData;
        this.applyEnhancedPoseTransformations(poseData);
        this.lastUpdateTime = currentTime;
    }
    
    applyEnhancedPoseTransformations(poseData) {
        const keypoints = poseData.keypoints;
        
        // Apply transformations for each mapped keypoint
        Object.keys(this.poseMapping).forEach(keypointName => {
            const keypoint = keypoints[keypointName];
            const mapping = this.poseMapping[keypointName];
            const bone = this.bones[mapping.bone];
            
            if (keypoint && bone && keypoint.score > 0.3) {
                this.applyKeypointToBone(keypoint, bone, mapping);
            }
        });
        
        // Apply special transformations
        this.applyTorsoTransformation(keypoints);
        this.applyArmRotations(keypoints);
        this.applyLegRotations(keypoints);
        
        // Add subtle breathing and idle animations
        this.addSubtleAnimations();
    }
    
    applyKeypointToBone(keypoint, bone, mapping) {
        // Normalize keypoint coordinates (assuming 640x480 input)
        const normalizedX = (keypoint.x - 320) / 320;
        const normalizedY = -(keypoint.y - 240) / 240; // Flip Y axis
        
        // Calculate target position
        const targetPos = {
            x: normalizedX * mapping.scale + mapping.offset.x,
            y: normalizedY * mapping.scale + mapping.offset.y,
            z: mapping.offset.z
                };
                
                // Apply smoothing
                bone.position.x = this.lerp(bone.position.x, targetPos.x, this.smoothingFactor);
                bone.position.y = this.lerp(bone.position.y, targetPos.y, this.smoothingFactor);
                bone.position.z = this.lerp(bone.position.z, targetPos.z, this.smoothingFactor);
            }
    
    applyTorsoTransformation(keypoints) {
        if (keypoints.left_shoulder && keypoints.right_shoulder && this.bones.torso) {
            // Calculate torso rotation from shoulder alignment
            const shoulderAngle = Math.atan2(
                keypoints.right_shoulder.y - keypoints.left_shoulder.y,
                keypoints.right_shoulder.x - keypoints.left_shoulder.x
            );
            
            const targetRotation = shoulderAngle * 0.2; // Reduced for subtlety
            this.bones.torso.rotation.z = this.lerp(
                this.bones.torso.rotation.z,
                targetRotation,
                this.smoothingFactor
            );
        }
    }
    
    applyArmRotations(keypoints) {
        // Left arm rotation
        if (keypoints.left_shoulder && keypoints.left_elbow && keypoints.left_wrist) {
            this.applyArmRotation('left', keypoints);
        }
        
        // Right arm rotation
        if (keypoints.right_shoulder && keypoints.right_elbow && keypoints.right_wrist) {
            this.applyArmRotation('right', keypoints);
        }
    }
    
    applyArmRotation(side, keypoints) {
        const shoulder = keypoints[`${side}Shoulder`];
        const elbow = keypoints[`${side}Elbow`];
        const wrist = keypoints[`${side}Wrist`];
        
        const upperArm = this.bones[`${side}UpperArm`];
        const forearm = this.bones[`${side}Forearm`];
        
        if (upperArm) {
            // Upper arm angle
            const upperArmAngle = Math.atan2(
                elbow.y - shoulder.y,
                elbow.x - shoulder.x
            );
            
            const targetRotation = upperArmAngle + (side === 'left' ? Math.PI/8 : -Math.PI/8);
            upperArm.rotation.z = this.lerp(upperArm.rotation.z, targetRotation, this.smoothingFactor);
        }
        
        if (forearm) {
            // Forearm angle
            const forearmAngle = Math.atan2(
                wrist.y - elbow.y,
                wrist.x - elbow.x
            );
            
            const targetRotation = forearmAngle + (side === 'left' ? Math.PI/6 : -Math.PI/6);
            forearm.rotation.z = this.lerp(forearm.rotation.z, targetRotation, this.smoothingFactor);
        }
    }
    
    applyLegRotations(keypoints) {
        // Left leg rotation
        if (keypoints.left_hip && keypoints.left_knee && keypoints.left_ankle) {
            this.applyLegRotation('left', keypoints);
        }
        
        // Right leg rotation
        if (keypoints.right_hip && keypoints.right_knee && keypoints.right_ankle) {
            this.applyLegRotation('right', keypoints);
        }
    }
    
    applyLegRotation(side, keypoints) {
        const hip = keypoints[`${side}Hip`];
        const knee = keypoints[`${side}Knee`];
        const ankle = keypoints[`${side}Ankle`];
        
        const thigh = this.bones[`${side}Thigh`];
        const shin = this.bones[`${side}Shin`];
        
        if (thigh) {
            // Thigh angle
            const thighAngle = Math.atan2(
                knee.y - hip.y,
                knee.x - hip.x
            );
            
            thigh.rotation.z = this.lerp(thigh.rotation.z, thighAngle * 0.3, this.smoothingFactor);
        }
        
        if (shin) {
            // Shin angle
            const shinAngle = Math.atan2(
                ankle.y - knee.y,
                ankle.x - knee.x
            );
            
            shin.rotation.z = this.lerp(shin.rotation.z, shinAngle * 0.3, this.smoothingFactor);
        }
    }
    
    addSubtleAnimations() {
        this.time += 0.01;
        
        // Subtle breathing animation
        if (this.bones.torso) {
            const breathingScale = 1 + Math.sin(this.time * 2) * 0.02;
            this.bones.torso.scale.y = breathingScale;
        }
        
        // Subtle head movement
        if (this.bones.head) {
            const headBob = Math.sin(this.time * 1.5) * 0.005;
            this.bones.head.position.y += headBob;
        }
    }
    
    lerp(start, end, factor) {
        return start + (end - start) * factor;
    }
    
    startRenderLoop() {
        const render = () => {
            if (this.isInitialized && this.renderer && this.scene && this.camera) {
                this.renderer.render(this.scene, this.camera);
            }
            this.animationId = requestAnimationFrame(render);
        };
        render();
    }
    
    pauseRendering() {
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
    }
    
    resumeRendering() {
        if (!this.animationId) {
            this.startRenderLoop();
        }
    }
    
    resetPose() {
        Object.keys(this.originalTransforms).forEach(boneName => {
            const bone = this.bones[boneName];
            const original = this.originalTransforms[boneName];
            
            if (bone && original) {
                bone.position.copy(original.position);
                bone.rotation.copy(original.rotation);
                bone.scale.copy(original.scale);
            }
        });
        
        console.log('Avatar pose reset to original position');
    }
    
    dispose() {
        this.pauseRendering();
        
        if (this.renderer) {
            this.renderer.dispose();
        }
        
        if (this.scene) {
            this.scene.clear();
        }
        
        console.log('Enhanced Side Avatar 3D disposed');
    }
}

// Replace the original SideAvatar3D with enhanced version
window.SideAvatar3D = EnhancedSideAvatar3D;

