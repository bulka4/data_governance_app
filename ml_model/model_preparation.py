"""
Save model from a Hugging Face in the onnx format so it can be loaded by the application when it starts. We run here the convert.py script for saving
a model in the onnx format.
"""

import os
import sentence_transformers as st

model = st.SentenceTransformer('sebastian-hofstaetter/distilbert-dot-tas_b-b256-msmarco')
model.save('model')

# converting a model into the ONNX format which we need in order to load model in javascript using 'AutoModel.from_pretrained' function
os.system('py -m convert --quantize --task default --model_id model')