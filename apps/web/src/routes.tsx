import type { RouteObject } from 'react-router-dom';
import { Home } from './routes/Home';
import { Layout } from './routes/Layout';
import { LessonWorkspace } from './routes/LessonWorkspace';
import { NotFound } from './routes/NotFound';

export const routes: RouteObject[] = [
  {
    element: <Layout />,
    children: [
      { path: '/', element: <Home /> },
      { path: '/lesson/:lessonId', element: <LessonWorkspace /> },
      { path: '*', element: <NotFound /> },
    ],
  },
];
