import { Button } from '@/components/ui/Button';

const MenuCategory = ({ category, setCategory }) => {
    return (
        <div className='mb-2'>
            <Button
                variant={category === 'Boba' ? 'default' : 'outline'}
                onClick={() => setCategory('Boba')}
            >
                Boba
            </Button>
            <Button
                variant={category === 'Corndog' ? 'default' : 'outline'}
                onClick={() => setCategory('Corndog')}
                className='ml-2'
            >
                Corndog
            </Button>
        </div>
    );
};

export default MenuCategory;
