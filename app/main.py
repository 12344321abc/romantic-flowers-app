import shutil
from pathlib import Path
from fastapi import FastAPI, Depends, HTTPException, status, UploadFile, File, Form, BackgroundTasks
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse, FileResponse
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime, timedelta
from . import crud, models, schemas, auth, telegram
from jose import JWTError, jwt
from .database import SessionLocal, engine, get_db

models.Base.metadata.create_all(bind=engine)

app = FastAPI()


# --- Path Configuration ---
BASE_DIR = Path(__file__).resolve().parent
UPLOADS_DIR = BASE_DIR / "static" / "uploads"
UPLOADS_DIR.mkdir(parents=True, exist_ok=True) # Ensure directory exists

app.mount("/static", StaticFiles(directory=str(BASE_DIR / "static")), name="static")

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")

async def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, auth.SECRET_KEY, algorithms=[auth.ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            raise credentials_exception
        token_data = schemas.TokenData(username=username)
    except JWTError:
        raise credentials_exception
    user = crud.get_user_by_username(db, username=token_data.username)
    if user is None:
        raise credentials_exception
    return user

async def get_current_admin_user(current_user: schemas.User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Not enough permissions")
    return current_user

@app.post("/token", response_model=schemas.Token)
async def login_for_access_token(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = crud.get_user_by_username(db, username=form_data.username)
    if not user or not auth.verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    access_token_expires = timedelta(minutes=auth.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = auth.create_access_token(
        data={"sub": user.username}, expires_delta=access_token_expires
    )
    return {"access_token": access_token, "token_type": "bearer"}

@app.post("/flowers/", response_model=schemas.FlowerBatch)
def create_flower(
    name: str = Form(...),
    description: str = Form(...),
    price: float = Form(...),
    quantity: int = Form(...),
    image: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(get_current_admin_user)
):
    # Save the uploaded file using an absolute path
    file_path = UPLOADS_DIR / image.filename
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(image.file, buffer)

    # Create a FlowerBatchCreate schema object from the form data
    flower_data = schemas.FlowerBatchCreate(
        name=name,
        description=description,
        price=price,
        quantity=quantity,
        image_url=f"/static/uploads/{image.filename}" # Save the path to the image
    )
    
    return crud.create_flower_batch(db=db, flower=flower_data)

@app.get("/flowers/", response_model=list[schemas.FlowerBatch])
def read_flowers(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    flowers = crud.get_flowers(db, skip=skip, limit=limit)
    return flowers

@app.get("/flowers/{flower_id}", response_model=schemas.FlowerBatch)
def read_flower(flower_id: int, db: Session = Depends(get_db)):
    db_flower = crud.get_flower(db, flower_id=flower_id)
    if db_flower is None:
        raise HTTPException(status_code=404, detail="Flower not found")
    return db_flower

@app.patch("/flowers/{flower_id}/sell", response_model=schemas.FlowerBatch)
def sell_flower(flower_id: int, sell_request: schemas.SellRequest, db: Session = Depends(get_db), current_user: schemas.User = Depends(get_current_admin_user)):
    db_flower = crud.sell_flowers(db, flower_id=flower_id, quantity_to_sell=sell_request.quantity)
    if db_flower is None:
        raise HTTPException(status_code=404, detail="Flower not found or not enough quantity")
    return db_flower

@app.patch("/flowers/{flower_id}/add", response_model=schemas.FlowerBatch)
def add_flower_quantity(flower_id: int, add_request: schemas.SellRequest, db: Session = Depends(get_db), current_user: schemas.User = Depends(get_current_admin_user)):
    db_flower = crud.add_quantity(db, flower_id=flower_id, quantity_to_add=add_request.quantity)
    if db_flower is None:
        raise HTTPException(status_code=404, detail="Flower not found")
    return db_flower

@app.delete("/flowers/{flower_id}", response_model=schemas.FlowerBatch)
def delete_flower(flower_id: int, db: Session = Depends(get_db), current_user: schemas.User = Depends(get_current_admin_user)):
    db_flower = crud.delete_flower(db, flower_id=flower_id)
    if db_flower is None:
        raise HTTPException(status_code=404, detail="Flower not found")
    return db_flower

@app.post("/cleanup")
def cleanup_old_flowers(db: Session = Depends(get_db), current_user: schemas.User = Depends(get_current_admin_user)):
    crud.delete_old_flowers(db)
    return {"message": "Cleanup successful"}

# --- User Management Endpoints (Admin Only) ---

@app.post("/users/", response_model=schemas.User)
def create_user_endpoint(
    db: Session = Depends(get_db),
    admin_user: schemas.User = Depends(get_current_admin_user),
    username: str = Form(...),
    password: str = Form(...),
    contact_name: str = Form(...),
    address: str = Form(""),
    admin_notes: str = Form(""),
    photo: Optional[UploadFile] = File(None)
):
    db_user = crud.get_user_by_username(db, username=username)
    if db_user:
        raise HTTPException(status_code=400, detail="Username already registered")
    
    photo_url = None
    if photo:
        file_path = UPLOADS_DIR / photo.filename
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(photo.file, buffer)
        photo_url = f"/static/uploads/{photo.filename}"
    
    user_schema = schemas.UserCreate(
        username=username,
        password=password,
        contact_name=contact_name,
        address=address,
        admin_notes=admin_notes,
    )
    
    return crud.create_user(db=db, user=user_schema, photo_url=photo_url)

@app.get("/users/", response_model=List[schemas.User])
def read_users(skip: int = 0, limit: int = 100, db: Session = Depends(get_db), admin_user: schemas.User = Depends(get_current_admin_user)):
    users = crud.get_users(db, skip=skip, limit=limit)
    return users

@app.get("/users/{user_id}", response_model=schemas.User)
def read_user(user_id: int, db: Session = Depends(get_db), admin_user: schemas.User = Depends(get_current_admin_user)):
    db_user = crud.get_user(db, user_id=user_id)
    if db_user is None:
        raise HTTPException(status_code=404, detail="User not found")
    return db_user

@app.put("/users/{user_id}", response_model=schemas.User)
def update_user_endpoint(user_id: int, user_update: schemas.UserUpdate, db: Session = Depends(get_db), admin_user: schemas.User = Depends(get_current_admin_user)):
    db_user = crud.update_user(db, user_id=user_id, user_update=user_update)
    if db_user is None:
        raise HTTPException(status_code=404, detail="User not found")
    return db_user

@app.delete("/users/{user_id}", response_model=schemas.User)
def delete_user_endpoint(user_id: int, db: Session = Depends(get_db), admin_user: schemas.User = Depends(get_current_admin_user)):
    db_user = crud.delete_user(db, user_id=user_id)
    if db_user is None:
        raise HTTPException(status_code=404, detail="User not found")
    return db_user

@app.get("/users/me/", response_model=schemas.User)
async def read_users_me(current_user: schemas.User = Depends(get_current_user)):
    return current_user

@app.get("/users/me/admin/", response_model=schemas.User)
async def read_admin_me(current_user: schemas.User = Depends(get_current_admin_user)):
    return current_user

# --- Order Management Endpoints ---

@app.get("/orders/me/", response_model=List[schemas.Order])
def read_my_orders(db: Session = Depends(get_db), current_user: schemas.User = Depends(get_current_user)):
    if current_user.role != 'customer':
        raise HTTPException(status_code=403, detail="Admins cannot have order history.")
    return crud.get_orders_by_customer(db, customer_id=current_user.id)

@app.post("/orders/", response_model=schemas.Order)
def create_order_endpoint(
    order: schemas.OrderCreate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(get_current_user)
):
    if current_user.role != 'customer':
        raise HTTPException(status_code=403, detail="Only customers can create orders.")

    result = crud.create_order(db=db, order=order, customer_id=current_user.id)
    if isinstance(result, str): # Error message returned
        raise HTTPException(status_code=400, detail=result)
    db_order = result

    # Add Telegram notification to background tasks
    # Prepare data for the notification
    # Prepare data for the notification, now including flower names
    items_details = []
    for item in db_order.items:
        flower_batch = crud.get_flower(db, item.flower_batch_id)
        items_details.append({
            "flower_batch_id": item.flower_batch_id,
            "quantity": item.quantity,
            "name": flower_batch.name if flower_batch else "Неизвестный цветок",
            "description": flower_batch.description if flower_batch else ""
        })

    order_details = {
        "order_id": db_order.id,
        "customer_name": current_user.contact_name,
        "customer_username": current_user.username,
        "customer_address": current_user.address,
        "comment": db_order.customer_comment,
        "items": items_details
    }
    background_tasks.add_task(
        telegram.send_new_order_notification,
        order_details=order_details
    )

    return db_order

@app.get("/orders/", response_model=List[schemas.Order])
def read_orders(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    admin_user: schemas.User = Depends(get_current_admin_user)
):
    orders = crud.get_orders(db, skip=skip, limit=limit)
    return orders

@app.get("/orders/{order_id}", response_model=schemas.Order)
def read_order(
    order_id: int,
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(get_current_user)
):
    db_order = crud.get_order(db, order_id=order_id)
    if db_order is None:
        raise HTTPException(status_code=404, detail="Order not found")
    
    # an admin can see any order, a customer only their own
    if current_user.role != 'admin' and db_order.customer_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not allowed to view this order")
        
    return db_order


@app.get("/", response_class=FileResponse)
async def read_root():
    return "app/static/index.html"

@app.get("/admin", response_class=HTMLResponse)
async def admin_page():
    return FileResponse('app/static/admin.html')

@app.post("/api/notify_new_flowers")
async def notify_new_flowers(
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    admin_user: schemas.User = Depends(get_current_admin_user)
):
    """
    Notifies all subscribers about new flower batches added in the last 3 hours.
    """
    three_hours_ago = datetime.utcnow() - timedelta(hours=3)
    new_flowers = db.query(models.FlowerBatch).filter(models.FlowerBatch.created_at >= three_hours_ago).all()
    
    if not new_flowers:
        return {"message": "Новых цветов за последние 3 часа не найдено."}

    background_tasks.add_task(telegram.broadcast_new_flowers, new_flowers)
    
    return {"message": f"Рассылка о {len(new_flowers)} новых партиях запущена!"}