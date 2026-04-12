---
Task ID: 1
Agent: Main
Task: Унифицировать структуру файла ассортимента — единый формат экспорта/импорта для всех 5 файлов

Work Log:
- Изучил текущие функции экспорта/импорта во всех 5 файлах (assortment.html, matrix-calc.html, fridges.html, fish-order.html, universal.html)
- Определил единую структуру 15 колонок: ⭐, Группа, Наименование, Код, Упак., Объём, Квант, Дом. полка, Поставщик, Продажи, Цена входящая, Цена на полке, Доход, Наценка %, Маржа %
- Обновил shared-utils.js до v3.2: добавил exportAssortmentUnified() и importAssortmentUnified()
- Обновил все 5 файлов: экспорт → SharedUtils.exportAssortmentUnified(), импорт → SharedUtils.importAssortmentUnified()
- Обновил syncToSavedAssortment() во всех файлах для сохранения mandatory и totalSales
- Обновил saveToAssortmentList() и loadAssortmentByName() в assortment.html

Stage Summary:
- shared-utils.js v3.2: единый экспорт/импорт ассортимента (15 колонок)
- Все 5 файлов используют SharedUtils.exportAssortmentUnified() / importAssortmentUnified()
- Обратная совместимость: importAssortmentUnified() автоматически определяет старый (10-кол) и новый (15-кол) формат
- Вычисляемые поля: Доход (полка-вход), Наценка %, Маржа %
- Каждый файл отображает только свои колонки в UI, но файл всегда единый
