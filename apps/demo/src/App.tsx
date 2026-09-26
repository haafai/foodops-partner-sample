import { Link, Navigate, Route, Routes } from 'react-router-dom';
import { ModeBanner } from './components/ModeBanner';
import { useSession } from './config/SessionProvider';
import { CheckoutPage } from './pages/CheckoutPage';
import { MenuPage } from './pages/MenuPage';
import { OrderPage } from './pages/OrderPage';
import { OrdersPage } from './pages/OrdersPage';
import { OutletsPage } from './pages/OutletsPage';
import { SetupPage } from './pages/SetupPage';

export function App() {
  const { client } = useSession();
  return (
    <div className="min-h-screen">
      <ModeBanner />
      <nav className="flex gap-4 border-b bg-white px-4 py-2 text-sm">
        <Link to="/outlets">Outlets</Link>
        <Link to="/checkout">Checkout</Link>
        <Link to="/orders">Orders</Link>
        <Link to="/setup">Setup</Link>
      </nav>
      <main>
        <Routes>
          <Route path="/" element={<Navigate to={client ? '/outlets' : '/setup'} replace />} />
          <Route path="/setup" element={<SetupPage />} />
          <Route path="/outlets" element={<OutletsPage />} />
          <Route path="/outlets/:outletId/menu" element={<MenuPage />} />
          <Route path="/checkout" element={<CheckoutPage />} />
          <Route path="/orders" element={<OrdersPage />} />
          <Route path="/orders/:orderId" element={<OrderPage />} />
        </Routes>
      </main>
    </div>
  );
}
