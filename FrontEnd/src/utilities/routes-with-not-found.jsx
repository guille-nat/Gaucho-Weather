import { Routes,Route} from 'react-router-dom';
import NotFound from '../components/NotFound';
import Layout from '../components/Layout';
export default function RutesWithNotFound({children}) {
    return (
        <Routes>
            {children}
            <Route path="*" element={<Layout component={<NotFound/>}/>}/>
        </Routes>
    );
}