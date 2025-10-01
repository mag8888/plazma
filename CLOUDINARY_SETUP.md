# Настройка Cloudinary для хранения файлов

## 1. Создайте аккаунт Cloudinary
1. Перейдите на https://cloudinary.com
2. Зарегистрируйтесь (бесплатно до 25GB)
3. Получите данные из Dashboard:
   - Cloud Name
   - API Key  
   - API Secret

## 2. Добавьте переменные в Railway
В Railway Variables добавьте:
```
CLOUDINARY_CLOUD_NAME=ваш_cloud_name
CLOUDINARY_API_KEY=ваш_api_key
CLOUDINARY_API_SECRET=ваш_api_secret
```

## 3. Доступ к веб админке
После деплоя откройте:
```
https://ваш-app-name.up.railway.app/admin
```

Для входа используйте ваш Telegram ID из ADMIN_CHAT_ID

## 4. Возможности веб админки
- ✅ Создание категорий товаров
- ✅ Создание товаров с загрузкой изображений
- ✅ Создание отзывов
- ✅ Просмотр статистики
- ✅ Управление партнёрами и заказами

## 5. Альтернативы Cloudinary
Если не хотите использовать Cloudinary:
- **AWS S3** - очень дешево
- **Google Cloud Storage** 
- **Firebase Storage**
- **Uploadcare**

Все файлы будут автоматически загружаться в облако и доступны по ссылкам.
