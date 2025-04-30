import { Search } from 'lucide-react';
import "./style/CitySelector.css";


const CitySelector = () => {

    return (
        <>

                <form action=""className="search-city">
                <label>
                    <input type="text" placeholder="Buscar..." />
                </label>
                <button type="submit"><Search /></button>
                </form>
        </>
    )
};

export default CitySelector;
