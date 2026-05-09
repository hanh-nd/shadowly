import modal

APP_NAME = "shadowly-backend"
SECRET_NAME = "shadowly-secrets"

# --- Image Definition ---
image = (
    modal.Image.debian_slim(python_version="3.10")
    .apt_install("espeak-ng")
    .pip_install(
        "torch",
        "transformers",
        "fastapi[standard]",
        "python-multipart",
        "librosa",
        "soundfile",
        "accelerate",
        "python-dotenv",
        "phonemizer",
    )
    .run_commands(
        "python -c 'from transformers import pipeline; pipeline(\"automatic-speech-recognition\", model=\"openai/whisper-large-v3-turbo\")'",
        "python -c 'from transformers import pipeline; pipeline(\"automatic-speech-recognition\", model=\"facebook/wav2vec2-lv-60-espeak-cv-ft\")'",
    )
    .add_local_file("main.py", "/root/main.py")
)

app = modal.App(APP_NAME, image=image)

# --- Modal Entrypoint ---
@app.function(
    gpu="A10G", 
    scaledown_window=30, 
    enable_memory_snapshot=True, 
    image=image,
    secrets=[modal.Secret.from_name(SECRET_NAME)]
)
@modal.asgi_app()
def run():
    import main
    # Warm up models to ensure they are captured in the memory snapshot
    print("Priming models for memory snapshot...")
    main.get_models()
    return main.app
