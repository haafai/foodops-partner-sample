import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from './components/AppShell';
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
    <AppShell>
      <Routes>
        <Route path="/" element={<Navigate to={client ? '/outlets' : '/setup'} replace />} />
        <Route path="/setup" element={<SetupPage />} />
        <Route path="/outlets" element={<OutletsPage />} />
        <Route path="/outlets/:outletId/menu" element={<MenuPage />} />
        <Route path="/checkout" element={<CheckoutPage />} />
        <Route path="/orders" element={<OrdersPage />} />
        <Route path="/orders/:orderId" element={<OrderPage />} />
      </Routes>
    </AppShell>
  );
}
