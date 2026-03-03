import { AppRoutes } from './router';
import { NavBar } from './components/NavBar';

function App() {
  return (
    <div className="app-root">
      <NavBar />
      <main className="app-main">
        <AppRoutes />
      </main>
    </div>
  );
}

export default App;

