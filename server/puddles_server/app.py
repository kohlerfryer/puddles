from fastapi import FastAPI

app = FastAPI(title="Puddles server")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
