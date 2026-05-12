'use client';

import StationPage from '@/components/StationPage';

const STATE_NEXT = { received: 'making', making: 'ready', ready: 'pickedup', pickedup: 'received' };
const STATE_CLASS = {
    received: 'bg-red-50 text-red-900',
    making: 'bg-red-100 text-red-900',
    ready: 'bg-red-300 text-red-900',
    pickedup: 'bg-red-500 text-white',
};
const STATE_BADGE = { received: 'New', making: 'Making…', ready: 'Ready ✓', pickedup: 'Picked Up ✓' };
const STATE_TOOLTIP = {
    received: 'Click to mark as Making',
    making: 'Click to mark as Ready',
    ready: 'Click to mark as Picked Up',
    pickedup: 'Click to reset',
};

export default function CorndogStation() {
    return (
        <StationPage
            title='🌭 Corndog Station'
            sectionKey='corndog-station'
            filterItem={(item) => item.type === 'Corndog'}
            initialState='received'
            stateNext={STATE_NEXT}
            stateClass={STATE_CLASS}
            stateBadge={STATE_BADGE}
            stateTooltip={STATE_TOOLTIP}
        />
    );
}
