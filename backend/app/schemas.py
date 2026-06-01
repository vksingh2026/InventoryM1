from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class ProductBase(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    sku: str = Field(min_length=1, max_length=64)
    price: Decimal = Field(gt=0, max_digits=10, decimal_places=2)
    quantity: int = Field(ge=0)


class ProductCreate(ProductBase):
    pass


class ProductUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    sku: str | None = Field(default=None, min_length=1, max_length=64)
    price: Decimal | None = Field(default=None, gt=0, max_digits=10, decimal_places=2)
    quantity: int | None = Field(default=None, ge=0)


class ProductRead(ProductBase):
    id: int
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class CustomerBase(BaseModel):
    full_name: str = Field(min_length=1, max_length=160)
    email: EmailStr
    phone: str = Field(min_length=3, max_length=40)


class CustomerCreate(CustomerBase):
    pass


class CustomerRead(CustomerBase):
    id: int
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class OrderItemCreate(BaseModel):
    product_id: int = Field(gt=0)
    quantity: int = Field(gt=0)


class OrderCreate(BaseModel):
    customer_id: int = Field(gt=0)
    items: list[OrderItemCreate] = Field(min_length=1)


class OrderItemRead(BaseModel):
    id: int
    product_id: int
    quantity: int
    unit_price: Decimal
    line_total: Decimal
    product: ProductRead

    model_config = ConfigDict(from_attributes=True)


class OrderRead(BaseModel):
    id: int
    customer_id: int
    total_amount: Decimal
    status: str
    created_at: datetime
    customer: CustomerRead
    items: list[OrderItemRead]

    model_config = ConfigDict(from_attributes=True)


class DashboardSummary(BaseModel):
    total_products: int
    total_customers: int
    total_orders: int
    low_stock_products: int


class SignupRequest(BaseModel):
    full_name: str = Field(min_length=1, max_length=160)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)


class SignupResponse(BaseModel):
    message: str
    email: EmailStr
    dev_otp: str


class VerifyOTPRequest(BaseModel):
    email: EmailStr
    otp: str = Field(min_length=6, max_length=6, pattern=r"^\d{6}$")


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)


class UserRead(BaseModel):
    id: int
    full_name: str
    email: EmailStr
    is_verified: bool

    model_config = ConfigDict(from_attributes=True)


class AuthResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserRead
