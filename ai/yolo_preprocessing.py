import os
import pandas as pd
import torch
from torch.utils.data import Dataset, DataLoader
import numpy as np
import cv2

IMAGE_SIZE = 640

class NNDataset(Dataset):
    def __init__(self, image_paths, exercises):
        self.image_paths = image_paths
        self.exercises = exercises

    def __len__(self):
        return len(self.image_paths)

    def __getitem__(self, idx):
        image = preprocess_image(self.image_paths[idx])
        exercise = torch.tensor(self.exercises[idx], dtype=torch.float32)
        return torch.tensor(image, dtype=torch.float32), exercise

def preprocess_image(imagePath):
    imagePath = f'images/{imagePath}'
    image = cv2.imread(imagePath)
    if image is None:
        raise FileNotFoundError(f"Image not found: {imagePath}")
    
    #resize image to be used by pose estimation model and normalise it
    resized = cv2.resize(image, (IMAGE_SIZE, IMAGE_SIZE))
    normalized = resized.astype(np.float32) / 255.0
    return normalized.transpose(2, 0, 1)

def preprocessing(imageFolder, batchSize):

    imageList = []
    imageFiles = os.listdir(imageFolder)
    for image in imageFiles:
        if image[0] != ".":
            imageList.append(image)
    exercises = [int(imagePath[1]) for imagePath in imageList] #ex_idx.png/jpg

    dataset = NNDataset(np.array(imageList), np.array(exercises))
    dataloader = DataLoader(dataset, batch_size=batchSize)

    return dataloader
