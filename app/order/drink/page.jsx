'use client';

import StationPage from '@/components/StationPage';

const STATE_NEXT = { new: 'ready', ready: 'pickedup', pickedup: 'new' };
const STATE_CLASS = {
    new: 'bg-blue-100 text-blue-900',
    ready: 'bg-blue-300 text-blue-900',
    pickedup: 'bg-blue-500 text-white',
};
const STATE_BADGE = { new: 'New', ready: 'Ready ✓', pickedup: 'Picked Up ✓' };
const STATE_TOOLTIP = {
    new: 'Click to mark as Ready',
    ready: 'Click to mark as Picked Up',
    pickedup: 'Click to reset',
};

export default function DrinkStation() {
    return (
        <StationPage
            title='🧋 Drink Station'
            sectionKey='drink-station'
            filterItem={(item) => item.type === 'Boba'}
            initialState='new'
            stateNext={STATE_NEXT}
            stateClass={STATE_CLASS}
            stateBadge={STATE_BADGE}
            stateTooltip={STATE_TOOLTIP}
        />
    );
}
