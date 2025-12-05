## 多语言文件(i18n/locales/下的json文件)
1. 不要使用嵌套多层，只使用一层key: value形式。
2. key的命名不要根据位置和业务模块决定，而是直接根据value文本确定，这样当其他地方使用相同value的key时，可以复用；比如"简单语法"对应为"simple_syntax"更合适。”全部“对应"all"，”搜索“对应"search"等。不要添加"btn","label", "text"等任何前缀，直接根据value文本值翻译并适当确定简短的key
3. 对于3个及以上相似的key，如title_required和author_required, summary_required，应分割为多个key（如title, author, summary, item_required），减少信息冗余
