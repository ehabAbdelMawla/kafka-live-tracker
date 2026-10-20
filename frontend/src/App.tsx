import { BrowserRouter, Route, Routes, useParams } from 'react-router-dom';
import { TrackerPage } from './pages/TrackerPage';
import { ViewerPage } from './pages/ViewerPage';

// "/"      = tracker page (start/stop, share link)
// "/track/:shareId" = public viewer page
export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<TrackerPage />} />
        <Route path="/track/:shareId" element={<ViewerRoute />} />
      </Routes>
    </BrowserRouter>
  );
}

function ViewerRoute() {
  const { shareId } = useParams<{ shareId: string }>();
  if (!shareId) return <p>Link not found.</p>;
  return <ViewerPage shareId={shareId} />;
}
