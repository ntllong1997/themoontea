import MenuItem from './MenuItem';

const CorndogOptions = ({ selectedCorndog, setSelectedCorndog }) => {
    const corndogs = [
        'Cheese Potato',
        'Cheese Hot Cheeto',
        'Half-Half Potato',
        'Half-Half Hot Cheeto',
        'Soda',
    ];

    return (
        <div className='grid grid-cols-1 gap-2 mb-4'>
            {corndogs.map((corndog) => (
                <MenuItem
                    key={corndog}
                    name={corndog}
                    selectedItem={selectedCorndog}
                    setSelectedItem={setSelectedCorndog}
                />
            ))}
        </div>
    );
};

export default CorndogOptions;
