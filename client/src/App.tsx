import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { Paywall } from "./components/Paywall";
import { ThemeProvider } from "./contexts/ThemeContext";
import { I18nProvider } from "./contexts/I18nContext";
import { SubscriptionProvider } from "./contexts/SubscriptionContext";
import Home from "./pages/Home";

function Router() {
  return (
    <Switch>
      <Route path={"/"} component={Home} />
      <Route path={"/404"} component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light" switchable>
        <I18nProvider>
          <SubscriptionProvider>
            <TooltipProvider>
              <Toaster />
              <Paywall />
              <Router />
            </TooltipProvider>
          </SubscriptionProvider>
        </I18nProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
