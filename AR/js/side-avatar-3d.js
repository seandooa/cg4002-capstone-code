class SideAvatar3D {
    constructor(canvasId) {
      this.canvas = document.getElementById(canvasId);
      this.scene = null;
      this.camera = null;
      this.renderer = null;
      this.avatar = null;
      this.bones = {};
      this.isInitialized = false;
      this.currentView = 'side';
      this.avatarType = 'humanoid'; // Default to humanoid for fitness app
      
      // Avatar settings
      this.avatarScale = 0.8;
      this.avatarPosition = { x: 0, y: -0.3, z: 0 };
      
      // Animation properties
      this.animationId = null;
      this.currentPoseData = null;
      this.smoothingFactor = 0.3;
      this.time = 0;
      
      // Pose mapping for side view
      this.sideViewKeypoints = [
        'head', 'shoulder', 'elbow', 'wrist', 'hip', 'knee', 'ankle'
      ];
      
      this.initialize();
    }
    
    initialize() {
      if (!this.canvas) {
        console.error("Avatar canvas not found");
        return;
      }
      
      try {
        // Create scene
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x1a1a1a);
        
        // Create camera for side view
        this.camera = new THREE.PerspectiveCamera(
          75,
          this.canvas.clientWidth / this.canvas.clientHeight,
          0.1,
          1000
        );
        this.setCameraView('side');
        
        // Create renderer
        this.renderer = new THREE.WebGLRenderer({
          canvas: this.canvas,
          alpha: true,
          antialias: true
        });
        this.renderer.setSize(this.canvas.clientWidth, this.canvas.clientHeight);
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        
        // Add lighting
        this.setupLighting();
        
        // Create avatar
        this.createAvatar();
        
        // Handle window resize
        window.addEventListener('resize', () => this.handleResize());
        
        this.isInitialized = true;
        this.startRenderLoop();
        
        console.log("Side Avatar 3D initialized successfully");
      } catch (error) {
        console.error("Failed to initialize Side Avatar 3D:", error);
      }
    }
    
    setupLighting() {
      // Ambient light
      const ambientLight = new THREE.AmbientLight(0x404040, 0.4);
      this.scene.add(ambientLight);
      
      // Main directional light from side
      const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
      directionalLight.position.set(3, 5, 2);
      directionalLight.castShadow = true;
      directionalLight.shadow.mapSize.width = 1024;
      directionalLight.shadow.mapSize.height = 1024;
      this.scene.add(directionalLight);
      
      // Fill light
      const fillLight = new THREE.DirectionalLight(0x00ff88, 0.3);
      fillLight.position.set(-3, 2, -2);
      this.scene.add(fillLight);
      
      // Ground plane
      const groundGeometry = new THREE.PlaneGeometry(10, 10);
      const groundMaterial = new THREE.ShadowMaterial({ opacity: 0.2 });
      const ground = new THREE.Mesh(groundGeometry, groundMaterial);
      ground.rotation.x = -Math.PI / 2;
      ground.position.y = -1.5;
      ground.receiveShadow = true;
      this.scene.add(ground);
    }
    
    createAvatar() {
      this.avatar = new THREE.Group();
      this.createHumanoidFigure();
      
      // Position avatar
      this.avatar.position.set(
        this.avatarPosition.x,
        this.avatarPosition.y,
        this.avatarPosition.z
      );
      this.avatar.scale.setScalar(this.avatarScale);
      
      this.scene.add(this.avatar);
    }
    
    createHumanoidFigure() {
      const bodyMaterial = new THREE.MeshLambertMaterial({ 
        color: 0x00ff88,
        transparent: true,
        opacity: 0.8
      });
      
      // Head
      const head = new THREE.Mesh(
        new THREE.SphereGeometry(0.15, 16, 16),
        bodyMaterial
      );
      head.position.set(0, 1.6, 0);
      head.castShadow = true;
      this.avatar.add(head);
      this.bones.head = head;
      
      // Store original position for reset
      head.userData.originalPosition = head.position.clone();
      
      // Neck
      const neck = new THREE.Mesh(
        new THREE.CylinderGeometry(0.05, 0.08, 0.15, 8),
        bodyMaterial
      );
      neck.position.set(0, 1.4, 0);
      neck.castShadow = true;
      this.avatar.add(neck);
      this.bones.neck = neck;
      neck.userData.originalPosition = neck.position.clone();
      
      // Torso
      const torso = new THREE.Mesh(
        new THREE.CylinderGeometry(0.18, 0.22, 0.7, 8),
        bodyMaterial
      );
      torso.position.set(0, 0.9, 0);
      torso.castShadow = true;
      this.avatar.add(torso);
      this.bones.torso = torso;
      this.bones.shoulder = torso; // Use torso as shoulder reference
      torso.userData.originalPosition = torso.position.clone();
      
      // Arms
      const armGeometry = new THREE.CylinderGeometry(0.04, 0.04, 0.35, 8);
      
      // Left upper arm
      const leftUpperArm = new THREE.Mesh(armGeometry, bodyMaterial);
      leftUpperArm.position.set(-0.25, 1.1, 0);
      leftUpperArm.rotation.z = Math.PI / 6;
      leftUpperArm.castShadow = true;
      this.avatar.add(leftUpperArm);
      this.bones.leftUpperArm = leftUpperArm;
      leftUpperArm.userData.originalPosition = leftUpperArm.position.clone();
      leftUpperArm.userData.originalRotation = leftUpperArm.rotation.clone();
      
      // Left forearm
      const leftForearm = new THREE.Mesh(armGeometry, bodyMaterial);
      leftForearm.position.set(-0.4, 0.8, 0);
      leftForearm.rotation.z = Math.PI / 4;
      leftForearm.castShadow = true;
      this.avatar.add(leftForearm);
      this.bones.leftForearm = leftForearm;
      this.bones.elbow = leftForearm; // Use left forearm for elbow reference
      leftForearm.userData.originalPosition = leftForearm.position.clone();
      leftForearm.userData.originalRotation = leftForearm.rotation.clone();
      
      // Left hand
      const leftHand = new THREE.Mesh(
        new THREE.SphereGeometry(0.06, 8, 8),
        bodyMaterial
      );
      leftHand.position.set(-0.55, 0.5, 0);
      leftHand.castShadow = true;
      this.avatar.add(leftHand);
      this.bones.leftHand = leftHand;
      this.bones.wrist = leftHand; // Use left hand for wrist reference
      leftHand.userData.originalPosition = leftHand.position.clone();
      
      // Right upper arm
      const rightUpperArm = new THREE.Mesh(armGeometry, bodyMaterial);
      rightUpperArm.position.set(0.25, 1.1, 0);
      rightUpperArm.rotation.z = -Math.PI / 6;
      rightUpperArm.castShadow = true;
      this.avatar.add(rightUpperArm);
      this.bones.rightUpperArm = rightUpperArm;
      rightUpperArm.userData.originalPosition = rightUpperArm.position.clone();
      rightUpperArm.userData.originalRotation = rightUpperArm.rotation.clone();
      
      // Right forearm
      const rightForearm = new THREE.Mesh(armGeometry, bodyMaterial);
      rightForearm.position.set(0.4, 0.8, 0);
      rightForearm.rotation.z = -Math.PI / 4;
      rightForearm.castShadow = true;
      this.avatar.add(rightForearm);
      this.bones.rightForearm = rightForearm;
      rightForearm.userData.originalPosition = rightForearm.position.clone();
      rightForearm.userData.originalRotation = rightForearm.rotation.clone();
      
      // Right hand
      const rightHand = new THREE.Mesh(
        new THREE.SphereGeometry(0.06, 8, 8),
        bodyMaterial
      );
      rightHand.position.set(0.55, 0.5, 0);
      rightHand.castShadow = true;
      this.avatar.add(rightHand);
      this.bones.rightHand = rightHand;
      rightHand.userData.originalPosition = rightHand.position.clone();
      
      // Hips
      const hips = new THREE.Mesh(
        new THREE.CylinderGeometry(0.15, 0.18, 0.2, 8),
        bodyMaterial
      );
      hips.position.set(0, 0.4, 0);
      hips.castShadow = true;
      this.avatar.add(hips);
      this.bones.hips = hips;
      this.bones.hip = hips; // Use hips for hip reference
      hips.userData.originalPosition = hips.position.clone();
      
      // Legs
      const legGeometry = new THREE.CylinderGeometry(0.06, 0.06, 0.4, 8);
      
      // Left thigh
      const leftThigh = new THREE.Mesh(legGeometry, bodyMaterial);
      leftThigh.position.set(-0.1, 0.0, 0);
      leftThigh.castShadow = true;
      this.avatar.add(leftThigh);
      this.bones.leftThigh = leftThigh;
      leftThigh.userData.originalPosition = leftThigh.position.clone();
      
      // Left shin
      const leftShin = new THREE.Mesh(legGeometry, bodyMaterial);
      leftShin.position.set(-0.1, -0.4, 0);
      leftShin.castShadow = true;
      this.avatar.add(leftShin);
      this.bones.leftShin = leftShin;
      this.bones.knee = leftShin; // Use left shin for knee reference
      leftShin.userData.originalPosition = leftShin.position.clone();
      
      // Left foot
      const leftFoot = new THREE.Mesh(
        new THREE.BoxGeometry(0.12, 0.04, 0.25),
        bodyMaterial
      );
      leftFoot.position.set(-0.1, -0.8, 0.08);
      leftFoot.castShadow = true;
      this.avatar.add(leftFoot);
      this.bones.leftFoot = leftFoot;
      this.bones.ankle = leftFoot; // Use left foot for ankle reference
      leftFoot.userData.originalPosition = leftFoot.position.clone();
      
      // Right thigh
      const rightThigh = new THREE.Mesh(legGeometry, bodyMaterial);
      rightThigh.position.set(0.1, 0.0, 0);
      rightThigh.castShadow = true;
      this.avatar.add(rightThigh);
      this.bones.rightThigh = rightThigh;
      rightThigh.userData.originalPosition = rightThigh.position.clone();
      
      // Right shin
      const rightShin = new THREE.Mesh(legGeometry, bodyMaterial);
      rightShin.position.set(0.1, -0.4, 0);
      rightShin.castShadow = true;
      this.avatar.add(rightShin);
      this.bones.rightShin = rightShin;
      rightShin.userData.originalPosition = rightShin.position.clone();
      
      // Right foot
      const rightFoot = new THREE.Mesh(
        new THREE.BoxGeometry(0.12, 0.04, 0.25),
        bodyMaterial
      );
      rightFoot.position.set(0.1, -0.8, 0.08);
      rightFoot.castShadow = true;
      this.avatar.add(rightFoot);
      this.bones.rightFoot = rightFoot;
      rightFoot.userData.originalPosition = rightFoot.position.clone();
    }
    
    setCameraView(view) {
      this.currentView = view;
      
      switch (view) {
        case 'side':
          this.camera.position.set(3, 0, 0);
          this.camera.lookAt(0, 0, 0);
          break;
        case 'front':
          this.camera.position.set(0, 0, 3);
          this.camera.lookAt(0, 0, 0);
          break;
        case 'perspective':
          this.camera.position.set(2, 1, 2);
          this.camera.lookAt(0, 0, 0);
          break;
      }
    }
    
    updatePose(poseData) {
      if (!this.isInitialized || !poseData || !poseData.keypoints) return;
      
      this.currentPoseData = poseData;
      this.applyPoseTransformations(poseData);
    }
    
    applyPoseTransformations(poseData) {
      const keypoints = poseData.keypoints;
      const time = Date.now() * 0.001;
      
      // Process each keypoint from side camera data
      keypoints.forEach(keypoint => {
        switch (keypoint.name) {
          case 'head':
            if (this.bones.head) {
              // Map head position and rotation
              const headY = this.mapCoordinate(keypoint.y, 0, 250, 1.4, 1.8);
              const headX = this.mapCoordinate(keypoint.x, 50, 200, -0.2, 0.2);
              this.smoothMove(this.bones.head, 'position', 'y', headY);
              this.smoothMove(this.bones.head, 'position', 'x', headX);
              
              // Add slight head rotation based on movement
              const headRotY = (keypoint.x - 125) * 0.002;
              this.smoothMove(this.bones.head, 'rotation', 'y', headRotY);
            }
            break;
            
          case 'shoulder':
            if (this.bones.shoulder) {
              const shoulderY = this.mapCoordinate(keypoint.y, 0, 250, 0.7, 1.1);
              const shoulderX = this.mapCoordinate(keypoint.x, 50, 200, -0.1, 0.1);
              this.smoothMove(this.bones.shoulder, 'position', 'y', shoulderY);
              this.smoothMove(this.bones.shoulder, 'position', 'x', shoulderX);
              
              // Rotate torso based on shoulder movement
              const torsoRotZ = (keypoint.x - 125) * 0.001;
              this.smoothMove(this.bones.shoulder, 'rotation', 'z', torsoRotZ);
            }
            break;
            
          case 'elbow':
            if (this.bones.leftForearm) {
              // Calculate arm angles for side view
              const elbowAngle = this.calculateElbowAngleFromKeypoint(keypoint);
              this.smoothMove(this.bones.leftForearm, 'rotation', 'z', elbowAngle);
              
              // Update forearm position
              const elbowY = this.mapCoordinate(keypoint.y, 0, 250, 0.6, 1.0);
              const elbowX = this.mapCoordinate(keypoint.x, 50, 200, -0.5, -0.3);
              this.smoothMove(this.bones.leftForearm, 'position', 'y', elbowY);
              this.smoothMove(this.bones.leftForearm, 'position', 'x', elbowX);
            }
            break;
            
          case 'wrist':
            if (this.bones.leftHand) {
              const wristY = this.mapCoordinate(keypoint.y, 0, 250, 0.3, 0.7);
              const wristX = this.mapCoordinate(keypoint.x, 50, 200, -0.7, -0.4);
              this.smoothMove(this.bones.leftHand, 'position', 'y', wristY);
              this.smoothMove(this.bones.leftHand, 'position', 'x', wristX);
            }
            break;
            
          case 'hip':
            if (this.bones.hip) {
              const hipY = this.mapCoordinate(keypoint.y, 0, 250, 0.2, 0.6);
              const hipX = this.mapCoordinate(keypoint.x, 50, 200, -0.05, 0.05);
              this.smoothMove(this.bones.hip, 'position', 'y', hipY);
              this.smoothMove(this.bones.hip, 'position', 'x', hipX);
            }
            break;
            
          case 'knee':
            if (this.bones.leftShin) {
              // Calculate knee angle
              const kneeAngle = this.calculateKneeAngleFromKeypoint(keypoint);
              this.smoothMove(this.bones.leftShin, 'rotation', 'z', kneeAngle * 0.5);
              
              // Update shin position
              const kneeY = this.mapCoordinate(keypoint.y, 0, 250, -0.6, -0.2);
              const kneeX = this.mapCoordinate(keypoint.x, 50, 200, -0.15, 0.15);
              this.smoothMove(this.bones.leftShin, 'position', 'y', kneeY);
              this.smoothMove(this.bones.leftShin, 'position', 'x', kneeX);
            }
            break;
            
          case 'ankle':
            if (this.bones.leftFoot) {
              const ankleY = this.mapCoordinate(keypoint.y, 0, 250, -1.0, -0.6);
              const ankleX = this.mapCoordinate(keypoint.x, 50, 200, -0.15, 0.15);
              this.smoothMove(this.bones.leftFoot, 'position', 'y', ankleY);
              this.smoothMove(this.bones.leftFoot, 'position', 'x', ankleX);
            }
            break;
        }
      });
      
      // Add breathing animation
      this.addBreathingAnimation();
      
      // Add subtle idle movements
      this.addIdleAnimation();
    }
    
    calculateElbowAngleFromKeypoint(keypoint) {
      // Simple angle calculation based on keypoint position
      // In a real implementation, you'd use multiple points
      const normalizedY = (keypoint.y - 125) / 125;
      return Math.PI / 4 + normalizedY * 0.5;
    }
    
    calculateKneeAngleFromKeypoint(keypoint) {
      // Simple angle calculation for knee
      const normalizedY = (keypoint.y - 125) / 125;
      return normalizedY * 0.3;
    }
    
    mapCoordinate(value, inMin, inMax, outMin, outMax) {
      const clamped = Math.max(inMin, Math.min(inMax, value));
      return ((clamped - inMin) * (outMax - outMin)) / (inMax - inMin) + outMin;
    }
    
    smoothMove(object, property, axis, targetValue) {
      if (!object || !object[property]) return;
      
      const currentValue = object[property][axis];
      const newValue = currentValue + (targetValue - currentValue) * this.smoothingFactor;
      object[property][axis] = newValue;
    }
    
    addBreathingAnimation() {
      if (!this.bones.torso) return;
      
      const time = Date.now() * 0.002;
      const breathScale = 1 + Math.sin(time) * 0.015;
      this.bones.torso.scale.y = breathScale;
    }
    
    addIdleAnimation() {
      const time = Date.now() * 0.001;
      
      // Add subtle head movement
      if (this.bones.head) {
        const headBob = Math.sin(time * 0.7) * 0.008;
        this.bones.head.position.y += headBob;
      }
      
      // Add subtle arm sway
      if (this.bones.leftUpperArm && this.bones.rightUpperArm) {
        const armSway = Math.sin(time * 0.4) * 0.015;
        this.bones.leftUpperArm.rotation.z += armSway;
        this.bones.rightUpperArm.rotation.z -= armSway;
      }
    }
    
    startRenderLoop() {
      const animate = () => {
        this.animationId = requestAnimationFrame(animate);
        this.time += 0.016; // Approximately 60fps
        
        // Subtle camera movement for side view
        if (this.camera && this.currentView === 'side') {
          const time = Date.now() * 0.0003;
          this.camera.position.y = Math.sin(time) * 0.1;
          this.camera.lookAt(0, 0, 0);
        }
        
        // Render the scene
        if (this.renderer && this.scene && this.camera) {
          this.renderer.render(this.scene, this.camera);
        }
      };
      
      animate();
    }
    
    handleResize() {
      if (!this.renderer || !this.camera) return;
      
      const rect = this.canvas.getBoundingClientRect();
      this.renderer.setSize(rect.width, rect.height);
      
      this.camera.aspect = rect.width / rect.height;
      this.camera.updateProjectionMatrix();
    }
    
    setVisibility(visible) {
      if (this.avatar) {
        this.avatar.visible = visible;
      }
    }
    
    resetPose() {
      // Reset all bones to original positions and rotations
      Object.values(this.bones).forEach(bone => {
        if (bone.userData.originalPosition) {
          bone.position.copy(bone.userData.originalPosition);
        }
        if (bone.userData.originalRotation) {
          bone.rotation.copy(bone.userData.originalRotation);
        } else {
          bone.rotation.set(0, 0, 0);
        }
        if (bone.scale) {
          bone.scale.set(1, 1, 1);
        }
      });
    }
    
    // Method to change avatar appearance for different exercises
    setExerciseType(exerciseType) {
      if (!this.avatar) return;
      
      // Change avatar color based on exercise
      const exerciseColors = {
        'push-ups': 0x00ff88,      // Green
        'bicep-curls': 0x4488ff,   // Blue
        'lateral-raises': 0xff8844, // Orange
        'squats': 0xff4488         // Pink
      };
      
      const color = exerciseColors[exerciseType] || 0x00ff88;
      
      // Update all materials
      this.avatar.children.forEach(child => {
        if (child.material) {
          child.material.color.setHex(color);
        }
      });
    }
    
    dispose() {
      if (this.animationId) {
        cancelAnimationFrame(this.animationId);
        this.animationId = null;
      }
      
      if (this.renderer) {
        this.renderer.dispose();
      }
      
      if (this.scene) {
        this.scene.clear();
      }
    }
  }
  
  // Make class globally available
  window.SideAvatar3D = SideAvatar3D;