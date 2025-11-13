import os
import pandas as pd
import torch
from torch.utils.data import Dataset, DataLoader
import numpy as np
import cv2
from ultralytics import YOLO

IMAGE_SIZE = 640
BICEP_CURLS_KEYPOINTS = [5, 6, 7, 8, 9, 10, 11, 12]

SQUATS_KEYPOINTS = [5, 6, 11, 12, 13, 14, 15, 16]

LATERAL_RAISE_KEYPOINTS = [5, 6, 7, 8, 9, 10, 11, 12]

KEYPOINTS = [BICEP_CURLS_KEYPOINTS, SQUATS_KEYPOINTS, LATERAL_RAISE_KEYPOINTS]

POSE_MODEL = "models/yolo11n-pose.pt"
pose_model = YOLO(POSE_MODEL)

def preprocess_image(imagePath):
    image = cv2.imread(imagePath)
    if image is None:
        raise FileNotFoundError(f"Image not found: {imagePath}")
    
    #resize image to be used by pose estimation model and normalise it
    resized = cv2.resize(image, (IMAGE_SIZE, IMAGE_SIZE))
    normalized = resized.astype(np.float32) / 255.0
    return normalized.transpose(2, 0, 1)

def get_poses(pose_model, image_path):
    path = f'images/{image_path}'
    image = cv2.imread(path)
    if image is None:
        raise FileNotFoundError(f"Image not found: {image_path}")

    resized = cv2.resize(image, (IMAGE_SIZE, IMAGE_SIZE))
    return pose_model(resized, verbose=False)

def cos_angle_between_points(A, B, C, D): 
    ABx, ABy = A[0] - B[0], A[1] - B[1]
    CDx, CDy = D[0] - C[0], D[1] - C[1]

    # dot product and magnitudes
    dot_product = ABx * CDx + ABy * CDy
    mag_AB = (ABx**2 + ABy**2) ** 0.5
    mag_CD = (CDx**2 + CDy**2) ** 0.5

    if mag_AB == 0 or mag_CD == 0:
        return 1.0  # cos(0°)

    return dot_product / (mag_AB * mag_CD)


def get_and_process_pose(pose_model, image_path, exercise):
    poses = get_poses(pose_model, image_path)

    #augment poses
    poses = poses[0]
    if len(poses.boxes) > 0:
        # Pick main subject
        areas = (poses.boxes.xyxy[:,2] - poses.boxes.xyxy[:,0]) * (poses.boxes.xyxy[:,3] - poses.boxes.xyxy[:,1])
        main_idx = torch.argmax(areas)
        kp = poses.keypoints.data[main_idx].cpu().numpy()
        kp = kp[:, :2] / IMAGE_SIZE

        #process poses
        processedArray = [] 
        for i in range(17):
            if (i in KEYPOINTS[exercise]):
                processedArray.extend(kp[i])
            else:
                processedArray.extend([0.0, 0.0])
        
        if (exercise == 0): #bicep curls
            processedArray.append(cos_angle_between_points(kp[6], kp[8], kp[8], kp[10]))
            processedArray.append(cos_angle_between_points(kp[5], kp[7], kp[7], kp[9]))
            processedArray.append(cos_angle_between_points(kp[8], kp[6], kp[6], kp[12]))
            processedArray.append(cos_angle_between_points(kp[7], kp[5], kp[5], kp[11]))
            processedArray.append(cos_angle_between_points(kp[6], kp[12], kp[6], [kp[6][0], kp[6][1] - 1]))
            processedArray.append(cos_angle_between_points(kp[5], kp[11], kp[5], [kp[5][0], kp[5][1] - 1])) 

            for i in range(16):
                processedArray.append(0.0)
            
            processedArray.extend([1, 0, 0])

        elif (exercise == 1): #squats
            for i in range(6):
                processedArray.append(0.0)
            
            processedArray.append(cos_angle_between_points(kp[5], kp[11], kp[11], kp[13]))
            processedArray.append(cos_angle_between_points(kp[6], kp[12], kp[12], kp[14]))
            processedArray.append(cos_angle_between_points(kp[11], kp[13], kp[13], kp[15]))
            processedArray.append(cos_angle_between_points(kp[12], kp[14], kp[14], kp[16]))
            processedArray.append(cos_angle_between_points(kp[11], kp[13], kp[13], [kp[13][0] - 1, kp[13][1]]))
            processedArray.append(cos_angle_between_points(kp[12], kp[14], kp[14], [kp[14][0] - 1, kp[14][1]]))
            processedArray.append(cos_angle_between_points(kp[13], kp[15], kp[15], [kp[15][0] - 1, kp[15][1]]))
            processedArray.append(cos_angle_between_points(kp[14], kp[16], kp[16], [kp[16][0] - 1, kp[16][1]]))
            processedArray.append(kp[5][0] - kp[13][0])
            processedArray.append(kp[5][0] - kp[14][0])
            processedArray.append(kp[6][0] - kp[13][0])
            processedArray.append(kp[6][0] - kp[14][0])

            for i in range(4):
                processedArray.append(0.0)
            
            processedArray.extend([0, 1, 0])

        else:
            processedArray.append(cos_angle_between_points(kp[6], kp[8], kp[8], kp[10]))
            processedArray.append(cos_angle_between_points(kp[5], kp[7], kp[7], kp[9]))
            processedArray.append(cos_angle_between_points(kp[8], kp[6], kp[6], kp[12]))
            processedArray.append(cos_angle_between_points(kp[7], kp[5], kp[5], kp[11]))

            for i in range(14):
                processedArray.append(0.0)

            processedArray.append(cos_angle_between_points(kp[8], kp[6], kp[6], kp[5]))
            processedArray.append(cos_angle_between_points(kp[6], kp[5], kp[5], kp[7]))
            processedArray.append(kp[10][1] - kp[6][1])
            processedArray.append(kp[9][1] - kp[5][1])
            processedArray.extend([0, 0, 1])
            

        flattened = np.array(processedArray)

        return flattened
    print(image_path, len(poses.boxes))
    

class NNDataset(Dataset):
    def __init__(self, imagePaths, exercises):
        self.imagePaths = imagePaths
        self.exercises = exercises

    def __len__(self):
        return len(self.imagePaths)

    def __getitem__(self, idx):
        pose = get_and_process_pose(self.imagePaths[idx], self.exercises[idx])
        return pose

def preprocessing(pose_model, imageList):
    images = [imagePath.split("/")[-1] for imagePath in imageList]
    exercises = [int(img[1]) - 1 for img in images] #ex_idx.png/jpg, to get the exercise type

    pose_list = []
    for i in range(len(images)):
        pose_list.append(get_and_process_pose(pose_model, images[i], exercises[i]))
    
    return pose_list

#if __name__ == "__main__":
#    preprocessing(pose_model, ["e1_1.png", "e3_2.png", "e3_1.png"])