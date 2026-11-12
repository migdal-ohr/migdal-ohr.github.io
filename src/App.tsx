import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Index from "./pages/Index.tsx";
import NotFound from "./pages/NotFound.tsx";
import Auth from "./pages/Auth.tsx";
import ResetPassword from "./pages/ResetPassword.tsx";
import OAuthConsent from "./pages/OAuthConsent.tsx";
import ConfirmAttendance from "./pages/ConfirmAttendance.tsx";
import Rsvp from "./pages/Rsvp.tsx";
import Register from "./pages/Register.tsx";
import { RequireAuth } from "./components/RequireAuth";
import { SessionProvider } from "./lib/session";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, "") || undefined}>
        <Routes>
          <Route path="/auth" element={<Auth />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/.lovable/oauth/consent" element={<OAuthConsent />} />
          <Route path="/confirm-attendance" element={<ConfirmAttendance />} />
          <Route path="/rsvp" element={<Rsvp />} />
          <Route path="/register" element={<Register />} />
          <Route path="/" element={<SessionProvider><RequireAuth><Index /></RequireAuth></SessionProvider>} />
          <Route path="*" element={<NotFound />} />
        </Routes>

      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);


export default App;
