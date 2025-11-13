/**
 * Additional methods for FitnessARApp to handle integrated avatar system
 */

// Add these methods to the FitnessARApp class

FitnessARApp.prototype.handlePoseDetected = function(pose) {
  // Handle pose detection from integrated avatar system
  if (!pose || !pose.keypoints) return;
  
  // Update UI with pose confidence
  this.updatePoseConfidence(pose.score);
  
  // Update posture feedback based on current exercise
  if (this.currentExercise) {
    const feedback = this.generatePostureFeedback(pose, this.currentExercise);
    this.updatePostureFeedback(feedback);
  }
};

FitnessARApp.prototype.handleRepDetected = function(repCount) {
  // Handle rep counting from integrated avatar system
  console.log(`Rep detected: ${repCount}`);
  
  // Update rep count display
  const repElement = document.getElementById("rep-count");
  if (repElement) {
    repElement.textContent = repCount;
  }
  
  // Update workout stats
  this.workoutStats.totalReps = repCount;
  
  // Calculate calories (rough estimation)
  this.workoutStats.caloriesBurned = this.calculateCalories(repCount, this.currentExercise);
  
  // Update calories display
  const caloriesElement = document.getElementById("calories-burned");
  if (caloriesElement) {
    caloriesElement.textContent = this.workoutStats.caloriesBurned;
  }
  
  // Provide audio feedback for rep completion
  this.playRepCompletionSound();
};

FitnessARApp.prototype.updatePoseConfidence = function(confidence) {
  // Update pose confidence indicator (if exists in UI)
  const confidenceElement = document.getElementById("pose-confidence");
  if (confidenceElement) {
    const percentage = Math.round(confidence * 100);
    confidenceElement.textContent = `${percentage}%`;
    
    // Update confidence indicator color
    if (percentage > 70) {
      confidenceElement.className = "confidence-good";
    } else if (percentage > 40) {
      confidenceElement.className = "confidence-medium";
    } else {
      confidenceElement.className = "confidence-poor";
    }
  }
};

FitnessARApp.prototype.generatePostureFeedback = function(pose, exerciseType) {
  const keypoints = pose.keypoints;
  const feedback = {
    status: "good",
    suggestions: []
  };
  
  switch (exerciseType) {
    case 'Hr Only':
      // No posture analysis for HR only mode
      feedback.suggestions.push("Monitoring heart rate");
      break;
    case 'bicep-curls':
      feedback = this.analyzeBicepCurlPosture(keypoints);
      break;
    case 'lateral-raises':
      feedback = this.analyzeLateralRaisePosture(keypoints);
      break;
    case 'squats':
      feedback = this.analyzeSquatPosture(keypoints);
      break;
    default:
      feedback.suggestions.push("Keep your form steady");
  }
  
  return feedback;
};

FitnessARApp.prototype.analyzePushUpPosture = function(keypoints) {
  const feedback = { status: "good", suggestions: [] };
  
  if (keypoints.left_shoulder && keypoints.right_shoulder && 
      keypoints.left_hip && keypoints.right_hip) {
    
    // Check body alignment
    const shoulderY = (keypoints.left_shoulder.y + keypoints.right_shoulder.y) / 2;
    const hipY = (keypoints.left_hip.y + keypoints.right_hip.y) / 2;
    const alignment = Math.abs(shoulderY - hipY);
    
    if (alignment > 50) {
      feedback.status = "warning";
      feedback.suggestions.push("Keep your body in a straight line");
    }
  }
  
  if (keypoints.left_elbow && keypoints.right_elbow && 
      keypoints.left_shoulder && keypoints.right_shoulder) {
    
    // Check elbow position
    const elbowSpread = Math.abs(keypoints.left_elbow.x - keypoints.right_elbow.x);
    const shoulderSpread = Math.abs(keypoints.left_shoulder.x - keypoints.right_shoulder.x);
    
    if (elbowSpread > shoulderSpread * 1.5) {
      feedback.status = "warning";
      feedback.suggestions.push("Keep elbows closer to your body");
    }
  }
  
  return feedback;
};

FitnessARApp.prototype.analyzeBicepCurlPosture = function(keypoints) {
  const feedback = { status: "good", suggestions: [] };
  
  if (keypoints.left_elbow && keypoints.left_shoulder && keypoints.left_wrist) {
    // Check elbow stability
    const elbowShoulderDistance = Math.abs(keypoints.left_elbow.x - keypoints.left_shoulder.x);
    
    if (elbowShoulderDistance > 30) {
      feedback.status = "warning";
      feedback.suggestions.push("Keep your elbow stable at your side");
    }
    
    // Check wrist alignment
    const wristElbowAngle = Math.atan2(
      keypoints.left_wrist.y - keypoints.left_elbow.y,
      keypoints.left_wrist.x - keypoints.left_elbow.x
    );
    
    if (Math.abs(wristElbowAngle) > Math.PI / 3) {
      feedback.suggestions.push("Control the movement - don't swing");
    }
  }
  
  return feedback;
};

FitnessARApp.prototype.analyzeLateralRaisePosture = function(keypoints) {
  const feedback = { status: "good", suggestions: [] };
  
  if (keypoints.left_wrist && keypoints.right_wrist && 
      keypoints.left_shoulder && keypoints.right_shoulder) {
    
    // Check arm height symmetry
    const leftArmHeight = keypoints.left_shoulder.y - keypoints.left_wrist.y;
    const rightArmHeight = keypoints.right_shoulder.y - keypoints.right_wrist.y;
    const heightDifference = Math.abs(leftArmHeight - rightArmHeight);
    
    if (heightDifference > 30) {
      feedback.status = "warning";
      feedback.suggestions.push("Raise both arms to the same height");
    }
    
    // Check if arms are raised high enough
    const avgArmHeight = (leftArmHeight + rightArmHeight) / 2;
    if (avgArmHeight < 20) {
      feedback.suggestions.push("Raise your arms higher - to shoulder level");
    }
  }
  
  return feedback;
};

FitnessARApp.prototype.analyzeSquatPosture = function(keypoints) {
  const feedback = { status: "good", suggestions: [] };
  
  if (keypoints.left_hip && keypoints.right_hip && 
      keypoints.left_knee && keypoints.right_knee) {
    
    // Check squat depth
    const hipY = (keypoints.left_hip.y + keypoints.right_hip.y) / 2;
    const kneeY = (keypoints.left_knee.y + keypoints.right_knee.y) / 2;
    const squatDepth = kneeY - hipY;
    
    if (squatDepth < 30) {
      feedback.suggestions.push("Squat deeper - hips below knees");
    }
    
    // Check knee alignment
    const kneeSpread = Math.abs(keypoints.left_knee.x - keypoints.right_knee.x);
    const hipSpread = Math.abs(keypoints.left_hip.x - keypoints.right_hip.x);
    
    if (kneeSpread < hipSpread * 0.8) {
      feedback.status = "warning";
      feedback.suggestions.push("Keep knees aligned with your toes");
    }
  }
  
  return feedback;
};

FitnessARApp.prototype.updatePostureFeedback = function(feedback) {
  const statusElement = document.getElementById("feedback-status");
  const suggestionsElement = document.getElementById("suggestions-list");
  
  if (statusElement) {
    statusElement.textContent = feedback.status === "good" ? "Good Form!" : "Check Form";
    statusElement.className = `feedback-${feedback.status}`;
  }
  
  if (suggestionsElement) {
    suggestionsElement.innerHTML = "";
    feedback.suggestions.forEach(suggestion => {
      const li = document.createElement("li");
      li.textContent = suggestion;
      suggestionsElement.appendChild(li);
    });
    
    if (feedback.suggestions.length === 0) {
      const li = document.createElement("li");
      li.textContent = "Great form! Keep it up!";
      suggestionsElement.appendChild(li);
    }
  }
};

FitnessARApp.prototype.calculateCalories = function(reps, exerciseType) {
  // Rough calorie estimation based on exercise type and reps
  const caloriesPerRep = {
    'Hr Only': 0.0,
    'bicep-curls': 0.3,
    'lateral-raises': 0.4,
    'squats': 0.6
  };
  
  const baseCalories = caloriesPerRep[exerciseType] || 0.4;
  return Math.round(reps * baseCalories);
};

FitnessARApp.prototype.playRepCompletionSound = function() {
  // Play a subtle sound for rep completion (if audio is enabled)
  try {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    // Configure oscillator for a subtle beep
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(400, audioContext.currentTime + 0.1);
    
    // Configure gain for subtle volume
    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.1);
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    // Play the sound
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.1);
  } catch (error) {
    // Silently fail if audio is not available
    console.log('Audio feedback not available:', error);
  }
};

