import uvicorn
import os

if __name__ == "__main__":
    is_prod = os.getenv("REPL_DEPLOYMENT", "").lower() == "true"
    uvicorn.run(
        "backend.main:app", 
        host="0.0.0.0", 
        port=5000, 
        reload=not is_prod,
        workers=4 if is_prod else 1
    )
