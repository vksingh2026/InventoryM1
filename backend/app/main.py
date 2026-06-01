from datetime import datetime, timedelta, timezone
from decimal import Decimal
import hashlib
import hmac
import secrets

from fastapi import Depends, FastAPI, Header, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload

from .database import Base, engine, get_db
from .models import AuthToken, Customer, OTPVerification, Order, OrderItem, Product, User
from .schemas import (
    AuthResponse,
    CustomerCreate,
    CustomerRead,
    DashboardSummary,
    LoginRequest,
    OrderCreate,
    OrderRead,
    ProductCreate,
    ProductRead,
    ProductUpdate,
    SignupRequest,
    SignupResponse,
    UserRead,
    VerifyOTPRequest,
)

Base.metadata.create_all(bind=engine)

app = FastAPI(title="Inventory & Order Management API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

TOKEN_TTL_HOURS = 12
OTP_TTL_MINUTES = 10


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def is_expired(value: datetime) -> bool:
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value < utc_now()


def hash_secret(value: str, salt: str | None = None) -> str:
    salt = salt or secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", value.encode(), salt.encode(), 100_000).hex()
    return f"{salt}${digest}"


def verify_secret(value: str, stored_hash: str) -> bool:
    salt, expected_digest = stored_hash.split("$", 1)
    candidate_digest = hash_secret(value, salt).split("$", 1)[1]
    return hmac.compare_digest(candidate_digest, expected_digest)


def create_token(db: Session, user: User) -> AuthToken:
    token = AuthToken(
        user_id=user.id,
        token=secrets.token_urlsafe(32),
        expires_at=utc_now() + timedelta(hours=TOKEN_TTL_HOURS),
    )
    db.add(token)
    db.commit()
    db.refresh(token)
    return token


def create_otp(db: Session, user: User) -> str:
    otp = f"{secrets.randbelow(1_000_000):06d}"
    db.add(
        OTPVerification(
            user_id=user.id,
            otp_hash=hash_secret(otp),
            expires_at=utc_now() + timedelta(minutes=OTP_TTL_MINUTES),
        )
    )
    db.commit()
    return otp


def get_current_user(
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> User:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required")

    token_value = authorization.split(" ", 1)[1].strip()
    token = db.query(AuthToken).filter(AuthToken.token == token_value).first()
    if not token or is_expired(token.expires_at):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired session")

    user = db.get(User, token.user_id)
    if not user or not user.is_verified:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Verified account required")
    return user


def commit_or_409(db: Session, message: str):
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=message) from exc


def get_product_or_404(db: Session, product_id: int) -> Product:
    product = db.get(Product, product_id)
    if not product:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found")
    return product


def get_customer_or_404(db: Session, customer_id: int) -> Customer:
    customer = db.get(Customer, customer_id)
    if not customer:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Customer not found")
    return customer


def get_order_or_404(db: Session, order_id: int) -> Order:
    order = (
        db.query(Order)
        .options(joinedload(Order.customer), joinedload(Order.items).joinedload(OrderItem.product))
        .filter(Order.id == order_id)
        .first()
    )
    if not order:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Order not found")
    return order


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/auth/signup", response_model=SignupResponse, status_code=status.HTTP_201_CREATED)
def signup(payload: SignupRequest, db: Session = Depends(get_db)):
    existing_user = db.query(User).filter(User.email == payload.email).first()
    if existing_user and existing_user.is_verified:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email is already registered")

    if existing_user:
        existing_user.full_name = payload.full_name
        existing_user.password_hash = hash_secret(payload.password)
        user = existing_user
    else:
        user = User(
            full_name=payload.full_name,
            email=payload.email,
            password_hash=hash_secret(payload.password),
            is_verified=False,
        )
        db.add(user)

    commit_or_409(db, "Email is already registered")
    db.refresh(user)
    otp = create_otp(db, user)
    return SignupResponse(message="OTP generated. Verify your account to continue.", email=user.email, dev_otp=otp)


@app.post("/auth/verify-otp", response_model=AuthResponse)
def verify_otp(payload: VerifyOTPRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == payload.email).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Account not found")

    otp_record = (
        db.query(OTPVerification)
        .filter(OTPVerification.user_id == user.id, OTPVerification.consumed_at.is_(None))
        .order_by(OTPVerification.id.desc())
        .first()
    )
    if not otp_record or is_expired(otp_record.expires_at) or not verify_secret(payload.otp, otp_record.otp_hash):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid or expired OTP")

    otp_record.consumed_at = utc_now()
    user.is_verified = True
    db.commit()
    token = create_token(db, user)
    return AuthResponse(access_token=token.token, user=UserRead.model_validate(user))


@app.post("/auth/login", response_model=AuthResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == payload.email).first()
    if not user or not verify_secret(payload.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password")
    if not user.is_verified:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Please verify your account with OTP")

    token = create_token(db, user)
    return AuthResponse(access_token=token.token, user=UserRead.model_validate(user))


@app.get("/auth/me", response_model=UserRead)
def me(current_user: User = Depends(get_current_user)):
    return current_user


@app.post("/products", response_model=ProductRead, status_code=status.HTTP_201_CREATED)
def create_product(payload: ProductCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    product = Product(**payload.model_dump())
    db.add(product)
    commit_or_409(db, "Product SKU must be unique")
    db.refresh(product)
    return product


@app.get("/products", response_model=list[ProductRead])
def list_products(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return db.query(Product).order_by(Product.id.desc()).all()


@app.get("/products/{product_id}", response_model=ProductRead)
def read_product(product_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return get_product_or_404(db, product_id)


@app.put("/products/{product_id}", response_model=ProductRead)
def update_product(product_id: int, payload: ProductUpdate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    product = get_product_or_404(db, product_id)
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(product, key, value)
    commit_or_409(db, "Product SKU must be unique")
    db.refresh(product)
    return product


@app.delete("/products/{product_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_product(product_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    product = get_product_or_404(db, product_id)
    db.delete(product)
    commit_or_409(db, "Product cannot be deleted while referenced by orders")


@app.post("/customers", response_model=CustomerRead, status_code=status.HTTP_201_CREATED)
def create_customer(payload: CustomerCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    customer = Customer(**payload.model_dump())
    db.add(customer)
    commit_or_409(db, "Customer email must be unique")
    db.refresh(customer)
    return customer


@app.get("/customers", response_model=list[CustomerRead])
def list_customers(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return db.query(Customer).order_by(Customer.id.desc()).all()


@app.get("/customers/{customer_id}", response_model=CustomerRead)
def read_customer(customer_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return get_customer_or_404(db, customer_id)


@app.delete("/customers/{customer_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_customer(customer_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    customer = get_customer_or_404(db, customer_id)
    db.delete(customer)
    commit_or_409(db, "Customer cannot be deleted while referenced by orders")


@app.post("/orders", response_model=OrderRead, status_code=status.HTTP_201_CREATED)
def create_order(payload: OrderCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    get_customer_or_404(db, payload.customer_id)

    requested_quantities: dict[int, int] = {}
    for item in payload.items:
        requested_quantities[item.product_id] = requested_quantities.get(item.product_id, 0) + item.quantity

    products = (
        db.query(Product)
        .filter(Product.id.in_(requested_quantities.keys()))
        .with_for_update()
        .all()
    )
    products_by_id = {product.id: product for product in products}
    missing_ids = set(requested_quantities) - set(products_by_id)
    if missing_ids:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Product not found: {min(missing_ids)}",
        )

    total = Decimal("0.00")
    order = Order(customer_id=payload.customer_id, total_amount=total)
    db.add(order)
    db.flush()

    for product_id, quantity in requested_quantities.items():
        product = products_by_id[product_id]
        if product.quantity < quantity:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Insufficient inventory for {product.name}",
            )
        product.quantity -= quantity
        line_total = product.price * quantity
        total += line_total
        db.add(
            OrderItem(
                order_id=order.id,
                product_id=product.id,
                quantity=quantity,
                unit_price=product.price,
                line_total=line_total,
            )
        )

    order.total_amount = total
    db.commit()
    return get_order_or_404(db, order.id)


@app.get("/orders", response_model=list[OrderRead])
def list_orders(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return (
        db.query(Order)
        .options(joinedload(Order.customer), joinedload(Order.items).joinedload(OrderItem.product))
        .order_by(Order.id.desc())
        .all()
    )


@app.get("/orders/{order_id}", response_model=OrderRead)
def read_order(order_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return get_order_or_404(db, order_id)


@app.delete("/orders/{order_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_order(order_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    order = get_order_or_404(db, order_id)
    db.delete(order)
    db.commit()


@app.get("/dashboard", response_model=DashboardSummary)
def dashboard(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return DashboardSummary(
        total_products=db.query(Product).count(),
        total_customers=db.query(Customer).count(),
        total_orders=db.query(Order).count(),
        low_stock_products=db.query(Product).filter(Product.quantity <= 5).count(),
    )
