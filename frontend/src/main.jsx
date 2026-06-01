import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  AlertCircle,
  Boxes,
  CheckCircle2,
  ClipboardList,
  Edit3,
  Lock,
  LogOut,
  Mail,
  PackagePlus,
  Plus,
  RefreshCw,
  ShieldCheck,
  ShoppingCart,
  Trash2,
  Users,
} from "lucide-react";
import { api } from "./api";
import "./styles.css";

const emptyProduct = { name: "", sku: "", price: "", quantity: "" };
const emptyCustomer = { full_name: "", email: "", phone: "" };
const emptyOrder = { customer_id: "", product_id: "", quantity: 1 };
const emptySignup = { full_name: "", email: "", password: "" };
const emptyLogin = { email: "", password: "" };
const emptyOtp = { email: "", otp: "" };

function money(value) {
  return Number(value || 0).toLocaleString(undefined, { style: "currency", currency: "USD" });
}

function Notice({ notice }) {
  if (!notice.message) return null;
  const Icon = notice.type === "error" ? AlertCircle : CheckCircle2;
  return (
    <div className={`notice ${notice.type}`}>
      <Icon size={18} />
      <span>{notice.message}</span>
    </div>
  );
}

function Stat({ icon: Icon, label, value }) {
  return (
    <section className="stat">
      <Icon size={22} />
      <div>
        <p>{label}</p>
        <strong>{value}</strong>
      </div>
    </section>
  );
}

function AuthScreen({ onAuthenticated }) {
  const [mode, setMode] = useState("login");
  const [signupForm, setSignupForm] = useState(emptySignup);
  const [loginForm, setLoginForm] = useState(emptyLogin);
  const [otpForm, setOtpForm] = useState(emptyOtp);
  const [devOtp, setDevOtp] = useState("");
  const [notice, setNotice] = useState({});
  const [busy, setBusy] = useState(false);

  async function submitSignup(event) {
    event.preventDefault();
    setBusy(true);
    try {
      const response = await api.signup(signupForm);
      setOtpForm({ email: response.email, otp: "" });
      setDevOtp(response.dev_otp);
      setMode("otp");
      setNotice({ type: "success", message: "OTP sent. Enter the code to activate your account." });
    } catch (error) {
      setNotice({ type: "error", message: error.message });
    } finally {
      setBusy(false);
    }
  }

  async function submitOtp(event) {
    event.preventDefault();
    setBusy(true);
    try {
      const response = await api.verifyOtp(otpForm);
      localStorage.setItem("inventory_auth_token", response.access_token);
      localStorage.setItem("inventory_auth_user", JSON.stringify(response.user));
      onAuthenticated(response.user);
    } catch (error) {
      setNotice({ type: "error", message: error.message });
    } finally {
      setBusy(false);
    }
  }

  async function submitLogin(event) {
    event.preventDefault();
    setBusy(true);
    try {
      const response = await api.login(loginForm);
      localStorage.setItem("inventory_auth_token", response.access_token);
      localStorage.setItem("inventory_auth_user", JSON.stringify(response.user));
      onAuthenticated(response.user);
    } catch (error) {
      setNotice({ type: "error", message: error.message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-shell">
      <section className="auth-copy">
        <div className="auth-mark"><ShieldCheck size={30} /></div>
        <h1>Inventory & Orders</h1>
        <p>Secure access for product, customer, order, and stock operations.</p>
      </section>

      <section className="auth-panel">
        <div className="auth-tabs">
          <button className={mode === "login" ? "active" : ""} onClick={() => setMode("login")}>Login</button>
          <button className={mode === "signup" ? "active" : ""} onClick={() => setMode("signup")}>Signup</button>
        </div>

        <Notice notice={notice} />

        {mode === "login" && (
          <form onSubmit={submitLogin}>
            <h2><Lock size={19} /> Login</h2>
            <label>Email<input required type="email" value={loginForm.email} onChange={(e) => setLoginForm({ ...loginForm, email: e.target.value })} /></label>
            <label>Password<input required minLength="8" type="password" value={loginForm.password} onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })} /></label>
            <button type="submit" disabled={busy}><Lock size={17} /> {busy ? "Signing in" : "Sign In"}</button>
          </form>
        )}

        {mode === "signup" && (
          <form onSubmit={submitSignup}>
            <h2><Users size={19} /> Signup</h2>
            <label>Full name<input required value={signupForm.full_name} onChange={(e) => setSignupForm({ ...signupForm, full_name: e.target.value })} /></label>
            <label>Email<input required type="email" value={signupForm.email} onChange={(e) => setSignupForm({ ...signupForm, email: e.target.value })} /></label>
            <label>Password<input required minLength="8" type="password" value={signupForm.password} onChange={(e) => setSignupForm({ ...signupForm, password: e.target.value })} /></label>
            <button type="submit" disabled={busy}><Mail size={17} /> {busy ? "Sending OTP" : "Send OTP"}</button>
          </form>
        )}

        {mode === "otp" && (
          <form onSubmit={submitOtp}>
            <h2><ShieldCheck size={19} /> Verify OTP</h2>
            <label>Email<input required type="email" value={otpForm.email} onChange={(e) => setOtpForm({ ...otpForm, email: e.target.value })} /></label>
            <label>OTP<input required inputMode="numeric" pattern="[0-9]{6}" maxLength="6" value={otpForm.otp} onChange={(e) => setOtpForm({ ...otpForm, otp: e.target.value.replace(/\D/g, "") })} /></label>
            {devOtp && <p className="otp-preview">Demo OTP: <strong>{devOtp}</strong></p>}
            <button type="submit" disabled={busy}><ShieldCheck size={17} /> {busy ? "Verifying" : "Verify Account"}</button>
          </form>
        )}
      </section>
    </main>
  );
}

function App() {
  const [user, setUser] = useState(() => {
    const storedUser = localStorage.getItem("inventory_auth_user");
    return storedUser ? JSON.parse(storedUser) : null;
  });
  const [activeTab, setActiveTab] = useState("products");
  const [products, setProducts] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [orders, setOrders] = useState([]);
  const [summary, setSummary] = useState({ total_products: 0, total_customers: 0, total_orders: 0, low_stock_products: 0 });
  const [notice, setNotice] = useState({});
  const [loading, setLoading] = useState(false);
  const [productForm, setProductForm] = useState(emptyProduct);
  const [editingProductId, setEditingProductId] = useState(null);
  const [customerForm, setCustomerForm] = useState(emptyCustomer);
  const [orderForm, setOrderForm] = useState(emptyOrder);
  const [selectedOrder, setSelectedOrder] = useState(null);

  async function loadAll() {
    if (!localStorage.getItem("inventory_auth_token")) return;
    setLoading(true);
    try {
      const [nextSummary, nextProducts, nextCustomers, nextOrders] = await Promise.all([
        api.dashboard(),
        api.products(),
        api.customers(),
        api.orders(),
      ]);
      setSummary(nextSummary);
      setProducts(nextProducts);
      setCustomers(nextCustomers);
      setOrders(nextOrders);
    } catch (error) {
      setNotice({ type: "error", message: error.message });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!user) return;
    loadAll();
  }, [user]);

  function logout() {
    localStorage.removeItem("inventory_auth_token");
    localStorage.removeItem("inventory_auth_user");
    setUser(null);
    setProducts([]);
    setCustomers([]);
    setOrders([]);
    setSummary({ total_products: 0, total_customers: 0, total_orders: 0, low_stock_products: 0 });
    setNotice({});
  }

  const selectedProduct = useMemo(
    () => products.find((product) => product.id === Number(orderForm.product_id)),
    [orderForm.product_id, products],
  );

  async function submitProduct(event) {
    event.preventDefault();
    const payload = {
      ...productForm,
      price: Number(productForm.price),
      quantity: Number(productForm.quantity),
    };
    try {
      if (editingProductId) {
        await api.updateProduct(editingProductId, payload);
        setNotice({ type: "success", message: "Product updated" });
      } else {
        await api.createProduct(payload);
        setNotice({ type: "success", message: "Product created" });
      }
      setProductForm(emptyProduct);
      setEditingProductId(null);
      await loadAll();
    } catch (error) {
      setNotice({ type: "error", message: error.message });
    }
  }

  async function submitCustomer(event) {
    event.preventDefault();
    try {
      await api.createCustomer(customerForm);
      setCustomerForm(emptyCustomer);
      setNotice({ type: "success", message: "Customer created" });
      await loadAll();
    } catch (error) {
      setNotice({ type: "error", message: error.message });
    }
  }

  async function submitOrder(event) {
    event.preventDefault();
    try {
      const order = await api.createOrder({
        customer_id: Number(orderForm.customer_id),
        items: [{ product_id: Number(orderForm.product_id), quantity: Number(orderForm.quantity) }],
      });
      setOrderForm(emptyOrder);
      setSelectedOrder(order);
      setNotice({ type: "success", message: "Order created and stock updated" });
      await loadAll();
    } catch (error) {
      setNotice({ type: "error", message: error.message });
    }
  }

  function startEdit(product) {
    setEditingProductId(product.id);
    setProductForm({
      name: product.name,
      sku: product.sku,
      price: product.price,
      quantity: product.quantity,
    });
  }

  async function remove(type, id) {
    try {
      if (type === "product") await api.deleteProduct(id);
      if (type === "customer") await api.deleteCustomer(id);
      if (type === "order") await api.deleteOrder(id);
      setSelectedOrder(null);
      setNotice({ type: "success", message: `${type[0].toUpperCase()}${type.slice(1)} deleted` });
      await loadAll();
    } catch (error) {
      setNotice({ type: "error", message: error.message });
    }
  }

  if (!user) {
    return <AuthScreen onAuthenticated={setUser} />;
  }

  return (
    <main>
      <header className="topbar">
        <div>
          <h1>Inventory & Orders</h1>
          <p>Signed in as {user.full_name}</p>
        </div>
        <div className="top-actions">
          <button className="icon-button" onClick={loadAll} title="Refresh data">
            <RefreshCw size={18} className={loading ? "spin" : ""} />
          </button>
          <button className="icon-button" onClick={logout} title="Logout">
            <LogOut size={18} />
          </button>
        </div>
      </header>

      <section className="stats-grid">
        <Stat icon={Boxes} label="Products" value={summary.total_products} />
        <Stat icon={Users} label="Customers" value={summary.total_customers} />
        <Stat icon={ClipboardList} label="Orders" value={summary.total_orders} />
        <Stat icon={AlertCircle} label="Low stock" value={summary.low_stock_products} />
      </section>

      <Notice notice={notice} />

      <nav className="tabs" aria-label="Inventory sections">
        {["products", "customers", "orders"].map((tab) => (
          <button key={tab} className={activeTab === tab ? "active" : ""} onClick={() => setActiveTab(tab)}>
            {tab}
          </button>
        ))}
      </nav>

      {activeTab === "products" && (
        <section className="workspace">
          <form className="panel" onSubmit={submitProduct}>
            <h2><PackagePlus size={19} /> {editingProductId ? "Update Product" : "Add Product"}</h2>
            <label>Name<input required value={productForm.name} onChange={(e) => setProductForm({ ...productForm, name: e.target.value })} /></label>
            <label>SKU<input required value={productForm.sku} onChange={(e) => setProductForm({ ...productForm, sku: e.target.value })} /></label>
            <div className="two-cols">
              <label>Price<input required min="0.01" step="0.01" type="number" value={productForm.price} onChange={(e) => setProductForm({ ...productForm, price: e.target.value })} /></label>
              <label>Stock<input required min="0" type="number" value={productForm.quantity} onChange={(e) => setProductForm({ ...productForm, quantity: e.target.value })} /></label>
            </div>
            <button type="submit"><Plus size={17} /> {editingProductId ? "Save Changes" : "Create Product"}</button>
          </form>
          <div className="panel wide">
            <h2><Boxes size={19} /> Product List</h2>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Name</th><th>SKU</th><th>Price</th><th>Stock</th><th></th></tr></thead>
                <tbody>
                  {products.map((product) => (
                    <tr key={product.id}>
                      <td>{product.name}</td><td>{product.sku}</td><td>{money(product.price)}</td><td>{product.quantity}</td>
                      <td className="actions">
                        <button className="icon-button" title="Edit product" onClick={() => startEdit(product)}><Edit3 size={16} /></button>
                        <button className="icon-button danger" title="Delete product" onClick={() => remove("product", product.id)}><Trash2 size={16} /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      {activeTab === "customers" && (
        <section className="workspace">
          <form className="panel" onSubmit={submitCustomer}>
            <h2><Users size={19} /> Add Customer</h2>
            <label>Full name<input required value={customerForm.full_name} onChange={(e) => setCustomerForm({ ...customerForm, full_name: e.target.value })} /></label>
            <label>Email<input required type="email" value={customerForm.email} onChange={(e) => setCustomerForm({ ...customerForm, email: e.target.value })} /></label>
            <label>Phone<input required value={customerForm.phone} onChange={(e) => setCustomerForm({ ...customerForm, phone: e.target.value })} /></label>
            <button type="submit"><Plus size={17} /> Create Customer</button>
          </form>
          <div className="panel wide">
            <h2><Users size={19} /> Customer List</h2>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Name</th><th>Email</th><th>Phone</th><th></th></tr></thead>
                <tbody>
                  {customers.map((customer) => (
                    <tr key={customer.id}>
                      <td>{customer.full_name}</td><td>{customer.email}</td><td>{customer.phone}</td>
                      <td className="actions"><button className="icon-button danger" title="Delete customer" onClick={() => remove("customer", customer.id)}><Trash2 size={16} /></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      {activeTab === "orders" && (
        <section className="workspace">
          <form className="panel" onSubmit={submitOrder}>
            <h2><ShoppingCart size={19} /> Create Order</h2>
            <label>Customer
              <select required value={orderForm.customer_id} onChange={(e) => setOrderForm({ ...orderForm, customer_id: e.target.value })}>
                <option value="">Select customer</option>
                {customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.full_name}</option>)}
              </select>
            </label>
            <label>Product
              <select required value={orderForm.product_id} onChange={(e) => setOrderForm({ ...orderForm, product_id: e.target.value })}>
                <option value="">Select product</option>
                {products.map((product) => <option key={product.id} value={product.id}>{product.name} ({product.quantity} in stock)</option>)}
              </select>
            </label>
            <label>Quantity<input required min="1" max={selectedProduct?.quantity || undefined} type="number" value={orderForm.quantity} onChange={(e) => setOrderForm({ ...orderForm, quantity: e.target.value })} /></label>
            <p className="estimate">Estimated total: {money((selectedProduct?.price || 0) * Number(orderForm.quantity || 0))}</p>
            <button type="submit"><Plus size={17} /> Place Order</button>
          </form>
          <div className="panel wide">
            <h2><ClipboardList size={19} /> Orders</h2>
            <div className="order-grid">
              <div className="table-wrap">
                <table>
                  <thead><tr><th>ID</th><th>Customer</th><th>Total</th><th></th></tr></thead>
                  <tbody>
                    {orders.map((order) => (
                      <tr key={order.id}>
                        <td>#{order.id}</td><td>{order.customer.full_name}</td><td>{money(order.total_amount)}</td>
                        <td className="actions">
                          <button className="text-button" onClick={() => setSelectedOrder(order)}>Details</button>
                          <button className="icon-button danger" title="Delete order" onClick={() => remove("order", order.id)}><Trash2 size={16} /></button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {selectedOrder && (
                <aside className="detail">
                  <h3>Order #{selectedOrder.id}</h3>
                  <p>{selectedOrder.customer.full_name}</p>
                  {selectedOrder.items.map((item) => (
                    <div className="line" key={item.id}>
                      <span>{item.product.name} x {item.quantity}</span>
                      <strong>{money(item.line_total)}</strong>
                    </div>
                  ))}
                  <div className="line total"><span>Total</span><strong>{money(selectedOrder.total_amount)}</strong></div>
                </aside>
              )}
            </div>
          </div>
        </section>
      )}
    </main>
  );
}

createRoot(document.getElementById("root")).render(<App />);
