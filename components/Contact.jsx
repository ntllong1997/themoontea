import Link from 'next/link';
import { FaFacebook, FaInstagram } from 'react-icons/fa';
import { IoIosMail } from 'react-icons/io';

const Contact = () => {
    return (
        <div className='grid grid-rows-3 grid-flow-col  '>
            <div className='row-span-3'></div>
            <div className='row-span-3 mx-5 bg-blue-600 p-6 m-5 rounded-lg'>
                <div className='mb-6'>
                    <h2 className='text-xl font-bold mb-2'>The Moon Tea</h2>
                    <p>4423 N Conway Ave Suite 210</p>
                    <p>Palmhurst, TX 78573</p>
                    <p className='mt-4 font-bold'>(956) 598 - 5088</p>
                </div>
                <hr className='pb-5' />
                <div className='flex items-center mb-6'>
                    <Link
                        href='mailto:ntl.themoontea@gmail.com'
                        className='hover:underline'
                    >
                        <IoIosMail className='inline-block' />
                        &nbsp;ntl.themoontea@gmail.com
                    </Link>
                </div>
                <hr className='pb-5' />
                <div className='flex space-x-4 mb-1'>
                    <Link
                        href='#'
                        className='text-black hover:text-blue-600'
                        aria-label='Facebook'
                    >
                        <FaFacebook className='h-10 w-auto' />
                    </Link>
                    <Link
                        href='#'
                        className='text-black hover:text-blue-600'
                        aria-label='Instagram'
                    >
                        <FaInstagram className='h-10 w-auto' />
                    </Link>
                </div>
            </div>
        </div>
    );
};

export default Contact;
