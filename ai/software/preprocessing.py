import pandas as pd
import torch
from torch.utils.data import Dataset, DataLoader
import numpy as np
import cv2
from ultralytics import YOLO
from sklearn.model_selection import train_test_split

IMAGE_SIZE = 640
BICEP_CURLS_KEYPOINTS = [5, 6, 7, 8, 9, 10, 11, 12]

SQUATS_KEYPOINTS = [5, 6, 11, 12, 13, 14, 15, 16]

LATERAL_RAISE_KEYPOINTS = [5, 6, 7, 8, 9, 10, 11, 12]

KEYPOINTS = [BICEP_CURLS_KEYPOINTS, SQUATS_KEYPOINTS, LATERAL_RAISE_KEYPOINTS]

POSE_MODEL = "models/yolo11n-pose.pt"
pose_model = YOLO(POSE_MODEL)

def get_poses(image_path):
    path = f'images/{image_path}'
    image = cv2.imread(path)
    if image is None:
        raise FileNotFoundError(f"Image not found: {image_path}")

    resized = cv2.resize(image, (IMAGE_SIZE, IMAGE_SIZE))
    return pose_model(resized, verbose=False)

def augment_pose_data(pose_estimates):
    augmented = pose_estimates.copy()
    
    # Add small random noise (now this noise is meaningful, e.g., 2% of image size)
    noise = np.random.normal(0, 0.02, size=augmented.shape)
    augmented += noise
    
    # Random scaling 
    scale = np.random.uniform(0.95, 1.05)
    center = np.mean(augmented, axis=0)
    augmented = (augmented - center) * scale + center
    
    # Random rotation 
    angle = np.random.uniform(-5, 5) * np.pi / 180
    cos_a, sin_a = np.cos(angle), np.sin(angle)
    rotation_matrix = np.array([[cos_a, -sin_a], [sin_a, cos_a]])
    augmented = (augmented - center) @ rotation_matrix.T + center
    
    # Clip to valid range [0, 1] 
    augmented = np.clip(augmented, 0, 1)
    
    return augmented

def cos_angle_between_points(A, B, C, D): #does order matter? what about the angle im getting? 
    ABx, ABy = A[0] - B[0], A[1] - B[1]
    CDx, CDy = D[0] - C[0], D[1] - C[1]

    # dot product and magnitudes
    dot_product = ABx * CDx + ABy * CDy
    mag_AB = (ABx**2 + ABy**2) ** 0.5
    mag_CD = (CDx**2 + CDy**2) ** 0.5

    if mag_AB == 0 or mag_CD == 0:
        return 1.0  # cos(0°)

    return dot_product / (mag_AB * mag_CD)


def get_and_process_pose(image_path, exercise, augment):
    augment = False
    poses = get_poses(image_path)

    #augment poses
    poses = poses[0]
    if len(poses.boxes) > 0:
        # Pick main subject
        areas = (poses.boxes.xyxy[:,2] - poses.boxes.xyxy[:,0]) * (poses.boxes.xyxy[:,3] - poses.boxes.xyxy[:,1])
        main_idx = torch.argmax(areas)
        kp = poses.keypoints.data[main_idx].cpu().numpy()
        kp = kp[:, :2] / IMAGE_SIZE

        if augment: #figure this out later
            kp = augment_pose_data(kp)

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
    def __init__(self, imagePaths, exercises, labels, isTraining):
        self.imagePaths = imagePaths
        self.exercises = exercises
        self.labels = labels
        self.isTraining = isTraining

    def __len__(self):
        return len(self.labels)

    def __getitem__(self, idx):
        pose = get_and_process_pose(self.imagePaths[idx], self.exercises[idx], self.isTraining)
        label = torch.tensor(self.labels[idx], dtype=torch.float32)
        return pose, label

def preprocessing(csv_filePath, batch_size, isTraining):
    df = pd.read_csv(csv_filePath)
    if (isTraining):
        tdf, vdf = train_test_split(
            df, test_size=0.1, shuffle=True, random_state=42
        )

        tdataset = NNDataset(tdf["image_path"].values, tdf["exercise"].values, tdf["label"].values, True)
        tdataloader = DataLoader(tdataset, batch_size=batch_size, shuffle=True)

        vdataset = NNDataset(vdf["image_path"].values, vdf["exercise"].values, vdf["label"].values, False)
        vdataloader = DataLoader(vdataset, batch_size=batch_size, shuffle=True)
        return tdataloader, vdataloader
    
    dataset = NNDataset(df["image_path"].values, df["exercise"].values, df["label"].values, False)
    dataloader = DataLoader(dataset, batch_size=batch_size, shuffle=True)

    return dataloader, None