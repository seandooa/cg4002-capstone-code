import pandas as pd
import torch
from torch.utils.data import Dataset, DataLoader
import numpy as np
import cv2

IMAGE_SIZE = 640

class NNDataset(Dataset):
    def __init__(self, image_paths, exercises, labels):
        self.image_paths = image_paths
        self.exercises = exercises
        self.labels = labels

    def __len__(self):
        return len(self.image_paths)

    def __getitem__(self, idx):
        image = preprocess_image(self.image_paths[idx])
        exercise = torch.tensor(self.exercises[idx], dtype=torch.float32)
        label = torch.tensor(self.labels[idx], dtype=torch.float32)
        return torch.tensor(image, dtype=torch.float32), exercise, label

def preprocess_image(image_path):
    image = cv2.imread(image_path)
    if image is None:
        raise FileNotFoundError(f"Image not found: {image_path}")
    
    #resize image to be used by pose estimation model and normalise it
    resized = cv2.resize(image, (IMAGE_SIZE, IMAGE_SIZE))
    normalized = resized.astype(np.float32) / 255.0
    return normalized.transpose(2, 0, 1)

def preprocessing(csv_filePath, batch_size):
    df = pd.read_csv(csv_filePath)

    image_paths = df['image_path'].values
    exercises = df['exercise'].values
    labels = df['label'].values

    dataset = NNDataset(image_paths, exercises, labels)
    dataloader = DataLoader(dataset, batch_size=batch_size, shuffle=True, drop_last=True)

    return dataloader
