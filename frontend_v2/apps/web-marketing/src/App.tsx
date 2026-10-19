import { Routes, Route } from 'react-router-dom';
import { Home } from './pages/Home';
import { Privacy } from './pages/Privacy';
import { About } from './pages/About';
import { Terms } from './pages/Terms';
import { Refunds } from './pages/Refunds';
import { Contact } from './pages/Contact';

function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/privacy" element={<Privacy />} />
      <Route path="/about" element={<About />} />
      <Route path="/terms" element={<Terms />} />
      <Route path="/refunds" element={<Refunds />} />
      <Route path="/contact" element={<Contact />} />
    </Routes>
  );
}

export default App;
