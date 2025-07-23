import { Button } from '@/components/ui/Button';

const MenuItem = ({ name, selectedItem, setSelectedItem }) => {
    return (
        <Button
            variant={selectedItem === name ? 'default' : 'outline'}
            className='w-full mb-1'
            onClick={() => setSelectedItem(name)}
        >
            {name}
        </Button>
    );
};

export default MenuItem;
