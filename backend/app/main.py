from fastapi import FastAPI

app = FastAPI(title="Blueslate API", description="AI receptionist for franchise businesses")


@app.get("/health")
def health():
    return {"status": "ok"}
