/**
 * Integrated Avatar System
 * Combines enhanced pose detection with 3D avatar rendering
 * Provides a unified interface for avatar animation based on live video feed
 */

class IntegratedAvatarSystem {
    constructor(canvasId, videoElementId) {
        this.canvasId = canvasId;
        this.videoElementId = videoElementId;
        this.videoElement = null;
        
        // Core components
        this.poseDetector = null;
        this.avatar3D = null;
        this.poseMapper = null;
        
        // Animation loop
        this.animationId = null;
        this.isRunning = false;
        this.lastDetectionTime = 0;
        this.detectionInterval = 100; // 10 FPS for pose detection
        
        // Settings
        this.showDebugInfo = false;
        this.avatarVisible = true;
        
        // Callbacks
        this.onPoseDetected = null;
        this.onRepCounted = null;
        this.onError = null;
        
        this.initialize();
    }
    
    async initialize() {
        try {
            console.log('Initializing Integrated Avatar System...');
            
            // Get video element
            this.videoElement = document.getElementById(this.videoElementId);
            if (!this.videoElement) {
                throw new Error(`Video element ${this.videoElementId} not found`);
            }
            
            // Initialize pose detector
            this.poseDetector = new EnhancedPoseDetector();
            await this.poseDetector.initialize();
            
            // Set up pose detection callbacks
            this.poseDetector.onPoseDetected = (pose) => {
                if (this.poseMapper && this.avatar3D) {
                    this.poseMapper.mapPoseToAvatar(pose, this.avatar3D);
                }
                if (this.onPoseDetected) {
                    this.onPoseDetected(pose);
                }
            };
            
            this.poseDetector.onRepDetected = (repCount) => {
                if (this.onRepCounted) {
                    this.onRepCounted(repCount);
                }
            };
            
            // Initialize 3D avatar
            this.avatar3D = new EnhancedSideAvatar3D(this.canvasId);
            
            // Initialize pose mapper
            this.poseMapper = new AvatarPoseMapper();
            
            console.log('Integrated Avatar System initialized successfully');
            
        } catch (error) {
            console.error('Failed to initialize Integrated Avatar System:', error);
            if (this.onError) {
                this.onError(error);
            }
            throw error;
        }
    }
    
    start() {
        if (this.isRunning) {
            console.warn('Avatar system is already running');
            return;
        }
        
        console.log('Starting avatar system...');
        this.isRunning = true;
        this.startDetectionLoop();
    }
    
    stop() {
        if (!this.isRunning) {
            console.warn('Avatar system is not running');
            return;
        }
        
        console.log('Stopping avatar system...');
        this.isRunning = false;
        
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
    }
    
    startDetectionLoop() {
        const detectAndRender = async (timestamp) => {
            if (!this.isRunning) return;
            
            // Perform pose detection at specified interval
            if (timestamp - this.lastDetectionTime >= this.detectionInterval) {
                try {
                    if (this.videoElement && this.videoElement.readyState >= 2) {
                        await this.poseDetector.detectPose(this.videoElement);
                    }
                    this.lastDetectionTime = timestamp;
                } catch (error) {
                    console.error('Error in pose detection:', error);
                }
            }
            
            // Continue animation loop
            this.animationId = requestAnimationFrame(detectAndRender);
        };
        
        this.animationId = requestAnimationFrame(detectAndRender);
    }
    
    setExerciseType(exerciseType) {
        if (this.poseDetector) {
            this.poseDetector.setExerciseType(exerciseType);
        }
        console.log(`Avatar system exercise type set to: ${exerciseType}`);
    }
    
    toggleAvatarVisibility() {
        this.avatarVisible = !this.avatarVisible;
        
        if (this.avatar3D && this.avatar3D.avatar) {
            this.avatar3D.avatar.visible = this.avatarVisible;
        }
        
        console.log(`Avatar visibility: ${this.avatarVisible}`);
        return this.avatarVisible;
    }
    
    toggleDebugInfo() {
        this.showDebugInfo = !this.showDebugInfo;
        console.log(`Debug info: ${this.showDebugInfo}`);
        return this.showDebugInfo;
    }
    
    setCameraView(view) {
        if (this.avatar3D) {
            this.avatar3D.setCameraView(view);
        }
    }
    
    reset() {
        if (this.poseDetector) {
            this.poseDetector.reset();
        }
        if (this.poseMapper) {
            this.poseMapper.reset();
        }
        if (this.avatar3D) {
            this.avatar3D.resetPose();
        }
    }
    
    getRepCount() {
        if (this.poseDetector && this.poseDetector.repCounter) {
            return this.poseDetector.repCounter.lastRepCount;
        }
        return 0;
    }
    
    // Configuration methods
    setDetectionInterval(interval) {
        this.detectionInterval = Math.max(50, interval); // Minimum 20 FPS
        console.log(`Detection interval set to: ${this.detectionInterval}ms`);
    }
    
    setSmoothingFactor(factor) {
        if (this.poseMapper) {
            this.poseMapper.smoothingFactor = Math.max(0.1, Math.min(1.0, factor));
            console.log(`Smoothing factor set to: ${this.poseMapper.smoothingFactor}`);
        }
    }
    
    // Utility methods
    isInitialized() {
        return this.poseDetector && this.avatar3D && this.poseMapper;
    }
    
    getStatus() {
        return {
            isRunning: this.isRunning,
            isInitialized: this.isInitialized(),
            avatarVisible: this.avatarVisible,
            showDebugInfo: this.showDebugInfo,
            repCount: this.getRepCount(),
            detectionInterval: this.detectionInterval
        };
    }
}

/**
 * Enhanced Side Avatar 3D with pose reset functionality
 */
class EnhancedSideAvatar3D extends SideAvatar3D {
    constructor(canvasId) {
        super(canvasId);
        this.originalPositions = {};
        this.originalRotations = {};
        this.storeOriginalTransforms();
    }
    
    storeOriginalTransforms() {
        // Store original positions and rotations for reset
        setTimeout(() => {
            if (this.bones) {
                Object.keys(this.bones).forEach(boneName => {
                    const bone = this.bones[boneName];
                    if (bone) {
                        this.originalPositions[boneName] = bone.position.clone();
                        this.originalRotations[boneName] = bone.rotation.clone();
                    }
                });
            }
        }, 1000); // Wait for avatar to be fully created
    }
    
    resetPose() {
        if (!this.bones) return;
        
        Object.keys(this.bones).forEach(boneName => {
            const bone = this.bones[boneName];
            if (bone && this.originalPositions[boneName] && this.originalRotations[boneName]) {
                bone.position.copy(this.originalPositions[boneName]);
                bone.rotation.copy(this.originalRotations[boneName]);
            }
        });
        
        console.log('Avatar pose reset to original position');
    }
}

// Replace the original SideAvatar3D with enhanced version
window.SideAvatar3D = EnhancedSideAvatar3D;
window.IntegratedAvatarSystem = IntegratedAvatarSystem;

