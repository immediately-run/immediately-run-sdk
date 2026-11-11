import { ReactNode } from 'react';

interface ProviderIconProps {
    /** The models.dev provider id (the sprite's symbol key). */
    id: string;
    /** The accessible name — and the lettermark's source when no icon exists. */
    label: string;
    /** Square edge in px. */
    size?: number;
}
declare function ProviderIcon({ id, label, size }: ProviderIconProps): ReactNode;

export { ProviderIcon, type ProviderIconProps };
