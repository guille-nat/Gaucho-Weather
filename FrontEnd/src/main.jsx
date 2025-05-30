import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux'; 
import store from './redux/store'; 
import App from './App.jsx';
import './styles/index.css';

createRoot(document.getElementById('root')).render(
 
    <Provider store={store}> 
      <App />
    </Provider>
  
);
