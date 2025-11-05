import tensorflow as tf
from tensorflow_model_optimization.quantization.keras import vitis_inspect, vitis_quantize
import numpy as np
import tensorflow_hub as hub

movenet_thunder_url = "https://tfhub.dev/google/movenet/singlepose/thunder/4"
movenet_keras_model = tf.keras.Sequential([
    tf.keras.Input(shape=(256, 256, 3)),
    
    # Wrap the MoveNet model in a KerasLayer
    hub.KerasLayer(
        movenet_thunder_url,
        trainable=False, # We usually freeze the weights for inference/feature extraction
        signature='serving_default',
        signature_outputs_as_dict=True
    )
], name='movenet_thunder_keras_wrapper')


target = "DPUCZDX8G_ISA1_B4096"
num_calibration_samples = 100
calib_images = tf.random.uniform(
    shape=(num_calibration_samples, 256, 256, 3), 
    minval=0, 
    maxval=255, 
    dtype=tf.float32
)

calib_images_int32 = tf.cast(calib_images, dtype=tf.int32)
calib_dataset = tf.data.Dataset.from_tensor_slices(calib_images_int32).batch(1)

quantizer = vitis_quantize.VitisQuantizer(movenet_keras_model)

with tf.keras.utils.custom_object_scope({'KerasLayer': hub.KerasLayer}):
    quantized_model = quantizer.quantize_model(
        calib_dataset=calib_dataset, 
        calib_steps=num_calibration_samples // 1, 
        calib_batch_size=1,
    )