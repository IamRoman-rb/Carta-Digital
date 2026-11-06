import { mediaUrl } from '../lib/media.js';
import { CategoryIcon } from '../lib/icons.jsx';
import { cx } from '../ui/index.jsx';

/**
 * Imagen de plato con srcset (480/960 px WebP) para que el teléfono descargue
 * solo la resolución que necesita. Sin foto, muestra un placeholder liviano.
 */
export default function DishImage({ product, icon = 'utensils', className, sizes = '(min-width: 768px) 50vw, 100vw', eager = false }) {
  if (!product.image) {
    return (
      <div className={cx('grid place-items-center bg-gradient-to-br from-primary-fixed to-secondary-fixed', className)} aria-hidden="true">
        <CategoryIcon name={icon} className="size-12 text-primary/60" />
      </div>
    );
  }
  return (
    <img
      src={mediaUrl(product.image_sm)}
      srcSet={`${mediaUrl(product.image_sm)} 480w, ${mediaUrl(product.image)} 960w`}
      sizes={sizes}
      alt={product.name}
      loading={eager ? 'eager' : 'lazy'}
      decoding="async"
      fetchPriority={eager ? 'high' : 'auto'}
      className={cx('object-cover', className)}
    />
  );
}
