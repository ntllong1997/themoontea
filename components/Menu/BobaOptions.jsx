import MenuItem from './MenuItem';

const BobaOptions = ({ selectedDrink, setSelectedDrink, selectedBoba, setSelectedBoba }) => {
    const drinks = [
        'Brown Sugar',
        'Korean Strawberry',
        'Double Cheese',
        'Tiramisu',
        'Tropical',
        'Strawberry',
        'Cafe',
        'Matcha Strawberry',
    ];
    const bobas = ['Tapioca', 'Mango Popping', 'Strawberry Popping'];

    return (
        <div className='grid grid-cols-2 gap-2 mb-4'>
            <div>
                <p className='font-semibold'>Drinks</p>
                {drinks.map((drink) => (
                    <MenuItem
                        key={drink}
                        name={drink}
                        selectedItem={selectedDrink}
                        setSelectedItem={setSelectedDrink}
                    />
                ))}
            </div>
            <div>
                <p className='font-semibold'>Boba</p>
                {bobas.map((boba) => (
                    <MenuItem
                        key={boba}
                        name={boba}
                        selectedItem={selectedBoba}
                        setSelectedItem={setSelectedBoba}
                    />
                ))}
            </div>
        </div>
    );
};

export default BobaOptions;
