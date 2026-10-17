/* 수도권 전철 노선 데이터
   n: 노선 id. 1~9호선은 숫자(저장된 도장 기록과 호환), 나머지는 짧은 영문 id
   name/short/en: 노선 이름 · 배지 글자 · 영문 (1~9호선은 생략하면 'N호선' · 'N' · 'Line N')
   kakao: 카카오 장소 이름에 붙는 노선명(좌표 검사 도구용), min: 한 정거장 어림 시간(분, 기본 2)
   pick: 뽑기 기본값(생략하면 켜짐). 설정에서 노선별로 바꿀 수 있어요
   역 이름이 같지만 다른 역은 '신촌(경의중앙)'처럼 괄호를 붙여 구분하고, 화면엔 괄호 앞만 보여요
   tracks: 노선의 갈래. 같은 갈래 안의 순서가 이전역/다음역이 됩니다.
   loop:true 이면 끝이 처음으로 이어지는 순환 구간입니다.
   opt.fwd/back: 순환선에서 나열 순서대로 / 거꾸로 갈 때의 이름
   opt.sep: 본선과 따로 다니는 지선(갈래가 만나는 역에서 갈아타야 함)
   opt.oneway: 나열 순서대로만 다니는 구간
   opt.name: 갈래 이름 */
(function () {
  const T = (s, loop, opt) => Object.assign({ s: s.split(' '), loop: !!loop }, opt);

  const LINES = [
    {
      n: 1, color: '#0052A4', ink: '#fff',
      tracks: [
        T('도봉산 도봉 방학 창동 녹천 월계 광운대 석계 신이문 외대앞 회기 청량리 제기동 신설동 동묘앞 동대문 종로5가 종로3가 종각 시청 서울역 남영 용산 노량진 대방 신길 영등포 신도림 구로 가산디지털단지 독산 금천구청'),
        T('구로 구일 개봉 오류동 온수', false, { name: '경인선' }),
      ],
    },
    {
      n: 2, color: '#00A84D', ink: '#fff',
      tracks: [
        T('시청 을지로입구 을지로3가 을지로4가 동대문역사문화공원 신당 상왕십리 왕십리 한양대 뚝섬 성수 건대입구 구의 강변 잠실나루 잠실 잠실새내 종합운동장 삼성 선릉 역삼 강남 교대 서초 방배 사당 낙성대 서울대입구 봉천 신림 신대방 구로디지털단지 대림 신도림 문래 영등포구청 당산 합정 홍대입구 신촌 이대 아현 충정로', true, { fwd: '내선순환', back: '외선순환' }),
        T('성수 용답 신답 용두 신설동', false, { sep: true, name: '성수지선' }),
        T('신도림 도림천 양천구청 신정네거리 까치산', false, { sep: true, name: '신정지선' }),
      ],
    },
    {
      n: 3, color: '#EF7C1C', ink: '#fff',
      tracks: [
        T('구파발 연신내 불광 녹번 홍제 무악재 독립문 경복궁 안국 종로3가 을지로3가 충무로 동대입구 약수 금호 옥수 압구정 신사 잠원 고속터미널 교대 남부터미널 양재 매봉 도곡 대치 학여울 대청 일원 수서 가락시장 경찰병원 오금'),
      ],
    },
    {
      n: 4, color: '#00A5DE', ink: '#fff',
      tracks: [
        T('불암산 상계 노원 창동 쌍문 수유 미아 미아사거리 길음 성신여대입구 한성대입구 혜화 동대문 동대문역사문화공원 충무로 명동 회현 서울역 숙대입구 삼각지 신용산 이촌 동작 총신대입구 사당 남태령'),
      ],
    },
    {
      n: 5, color: '#996CAC', ink: '#fff',
      tracks: [
        T('방화 개화산 김포공항 송정 마곡 발산 우장산 화곡 까치산 신정 목동 오목교 양평 영등포구청 영등포시장 신길 여의도 여의나루 마포 공덕 애오개 충정로 서대문 광화문 종로3가 을지로4가 동대문역사문화공원 청구 신금호 행당 왕십리 마장 답십리 장한평 군자 아차산 광나루 천호 강동 길동 굽은다리 명일 고덕 상일동 강일'),
        T('강동 둔촌동 올림픽공원 방이 오금 개롱 거여 마천', false, { name: '마천 방면' }),
      ],
    },
    {
      n: 6, color: '#CD7C2F', ink: '#fff',
      tracks: [
        T('응암 새절 증산 디지털미디어시티 월드컵경기장 마포구청 망원 합정 상수 광흥창 대흥 공덕 효창공원앞 삼각지 녹사평 이태원 한강진 버티고개 약수 청구 신당 동묘앞 창신 보문 안암 고려대 월곡 상월곡 돌곶이 석계 태릉입구 화랑대 봉화산 신내'),
        T('응암 역촌 불광 독바위 연신내 구산', true, { oneway: true, name: '응암순환' }),
      ],
    },
    {
      n: 7, color: '#747F00', ink: '#fff',
      tracks: [
        T('도봉산 수락산 마들 노원 중계 하계 공릉 태릉입구 먹골 중화 상봉 면목 사가정 용마산 중곡 군자 어린이대공원 건대입구 자양 청담 강남구청 학동 논현 반포 고속터미널 내방 총신대입구 남성 숭실대입구 상도 장승배기 신대방삼거리 보라매 신풍 대림 남구로 가산디지털단지'),
      ],
    },
    {
      n: 8, color: '#E6186C', ink: '#fff',
      tracks: [
        T('암사역사공원 암사 천호 강동구청 몽촌토성 잠실 석촌 송파 가락시장 문정 장지 복정'),
      ],
    },
    {
      n: 9, color: '#BDB092', ink: '#26231b',
      tracks: [
        T('개화 김포공항 공항시장 신방화 마곡나루 양천향교 가양 증미 등촌 염창 신목동 선유도 당산 국회의사당 여의도 샛강 노량진 노들 흑석 동작 구반포 신반포 고속터미널 사평 신논현 언주 선정릉 삼성중앙 봉은사 종합운동장 삼전 석촌고분 석촌 송파나루 한성백제 올림픽공원 둔촌오륜 중앙보훈병원'),
      ],
    },
    {
      n: 'GJ', name: '경의중앙선', short: '경의중앙', en: 'Gyeongui–Jungang', kakao: '경의중앙선', min: 3, pick: false,
      color: '#77C4A3', ink: '#10302a',
      tracks: [
        T('수색 디지털미디어시티 가좌 홍대입구 서강대 공덕 효창공원앞 용산 이촌 서빙고 한남 옥수 응봉 왕십리 청량리 회기 중랑 상봉 망우 양원'),
        T('서울역 신촌(경의중앙) 가좌', false, { sep: true, name: '서울역 갈래' }),
      ],
    },
    {
      n: 'SB', name: '수인분당선', short: '수인분당', en: 'Suin–Bundang', kakao: '수인분당선', pick: false,
      color: '#FABE00', ink: '#2a2200',
      tracks: [
        T('청량리 왕십리 서울숲 압구정로데오 강남구청 선정릉 선릉 한티 도곡 구룡 개포동 대모산입구 수서 복정'),
      ],
    },
    {
      n: 'SS', name: '신분당선', short: '신분당', en: 'Sinbundang', kakao: '신분당선', min: 3, pick: false,
      color: '#D4003B', ink: '#fff',
      tracks: [
        T('신사 논현 신논현 강남 양재 양재시민의숲 청계산입구'),
      ],
    },
    {
      n: 'AR', name: '공항철도', short: '공항', en: 'AREX', kakao: '공항철도', min: 4, pick: false,
      color: '#0090D2', ink: '#fff',
      tracks: [
        T('서울역 공덕 홍대입구 디지털미디어시티 마곡나루 김포공항'),
      ],
    },
    {
      n: 'GC', name: '경춘선', short: '경춘', en: 'Gyeongchun', kakao: '경춘선', min: 4, pick: false,
      color: '#0C8E72', ink: '#fff',
      tracks: [
        T('광운대 상봉 망우 신내'),
      ],
    },
    {
      n: 'UI', name: '우이신설선', short: '우이', en: 'Ui–Sinseol', kakao: '우이신설선', pick: false,
      color: '#B7C452', ink: '#25290c',
      tracks: [
        T('북한산우이 솔밭공원 4·19민주묘지 가오리 화계 삼양 삼양사거리 솔샘 북한산보국문 정릉 성신여대입구 보문 신설동'),
      ],
    },
    {
      n: 'SL', name: '신림선', short: '신림', en: 'Sillim', kakao: '신림선', pick: false,
      color: '#6789CA', ink: '#fff',
      tracks: [
        T('샛강 대방 서울지방병무청 보라매 보라매공원 보라매병원 당곡 신림 서원 서울대벤처타운 관악산'),
      ],
    },
  ];

  /* 서울 밖 역. 여기 없는 역은 서울이에요 (설정의 '서울' 범위에 쓰여요) */
  const REGION_RAW = {
    경기: '복정',
  };
  const REGION = {};
  Object.entries(REGION_RAW).forEach(([r, list]) => list.split(' ').forEach((n) => { REGION[n] = r; }));

  /* 영문 역명 (서울교통공사 표기 기준으로 정리) */
  const EN_RAW = [
    '시청:City Hall|서울역:Seoul Station|종각:Jonggak|종로3가:Jongno 3(sam)-ga|종로5가:Jongno 5(o)-ga|을지로입구:Euljiro 1(il)-ga|을지로3가:Euljiro 3(sam)-ga|을지로4가:Euljiro 4(sa)-ga',
    '동대문:Dongdaemun|동대문역사문화공원:Dongdaemun History & Culture Park|동묘앞:Dongmyo|신당:Sindang|상왕십리:Sangwangsimni|왕십리:Wangsimni|한양대:Hanyang Univ.|뚝섬:Ttukseom|성수:Seongsu',
    '건대입구:Konkuk Univ.|구의:Guui|강변:Gangbyeon|잠실나루:Jamsillaru|잠실:Jamsil|잠실새내:Jamsilsaenae|종합운동장:Sports Complex|삼성:Samseong|선릉:Seolleung|역삼:Yeoksam|강남:Gangnam',
    '교대:Seoul Nat\'l Univ. of Education|서초:Seocho|방배:Bangbae|사당:Sadang|낙성대:Nakseongdae|서울대입구:Seoul Nat\'l Univ.|봉천:Bongcheon|신림:Sillim|신대방:Sindaebang|구로디지털단지:Guro Digital Complex',
    '대림:Daerim|신도림:Sindorim|문래:Mullae|영등포구청:Yeongdeungpo-gu Office|당산:Dangsan|합정:Hapjeong|홍대입구:Hongik Univ.|신촌:Sinchon|이대:Ewha Womans Univ.|아현:Ahyeon|충정로:Chungjeongno',
    '용답:Yongdap|신답:Sindap|용두:Yongdu|신설동:Sinseol-dong|도림천:Dorimcheon|양천구청:Yangcheon-gu Office|신정네거리:Sinjeong Neger-ri|까치산:Kkachisan',
    '도봉산:Dobongsan|도봉:Dobong|방학:Banghak|창동:Chang-dong|녹천:Nokcheon|월계:Wolgye|광운대:Kwangwoon Univ.|석계:Seokgye|신이문:Sinimun|외대앞:Hankuk Univ. of Foreign Studies|회기:Hoegi|청량리:Cheongnyangni|제기동:Jegi-dong',
    '남영:Namyeong|용산:Yongsan|노량진:Noryangjin|대방:Daebang|신길:Singil|영등포:Yeongdeungpo|구로:Guro|구일:Guil|개봉:Gaebong|오류동:Oryu-dong|온수:Onsu|가산디지털단지:Gasan Digital Complex|독산:Doksan|금천구청:Geumcheon-gu Office',
    '구파발:Gupabal|연신내:Yeonsinnae|불광:Bulgwang|녹번:Nokbeon|홍제:Hongje|무악재:Muakjae|독립문:Dongnimmun|경복궁:Gyeongbokgung|안국:Anguk|충무로:Chungmuro|동대입구:Dongguk Univ.|약수:Yaksu|금호:Geumho|옥수:Oksu',
    '압구정:Apgujeong|신사:Sinsa|잠원:Jamwon|고속터미널:Express Bus Terminal|남부터미널:Southern Bus Terminal|양재:Yangjae|매봉:Maebong|도곡:Dogok|대치:Daechi|학여울:Hangnyeoul|대청:Daecheong|일원:Irwon|수서:Suseo|가락시장:Garak Market|경찰병원:Police Hospital|오금:Ogeum',
    '불암산:Buramsan|상계:Sanggye|노원:Nowon|쌍문:Ssangmun|수유:Suyu|미아:Mia|미아사거리:Mia-sageori|길음:Gireum|성신여대입구:Sungshin Women\'s Univ.|한성대입구:Hansung Univ.|혜화:Hyehwa|명동:Myeongdong|회현:Hoehyeon',
    '숙대입구:Sookmyung Women\'s Univ.|삼각지:Samgakji|신용산:Sinyongsan|이촌:Ichon|동작:Dongjak|총신대입구:Chongshin Univ.|남태령:Namtaeryeong',
    '방화:Banghwa|개화산:Gaehwasan|김포공항:Gimpo Int\'l Airport|송정:Songjeong|마곡:Magok|발산:Balsan|우장산:Ujangsan|화곡:Hwagok|신정:Sinjeong|목동:Mokdong|오목교:Omokgyo|양평:Yangpyeong|영등포시장:Yeongdeungpo Market',
    '여의도:Yeouido|여의나루:Yeouinaru|마포:Mapo|공덕:Gongdeok|애오개:Aeogae|서대문:Seodaemun|광화문:Gwanghwamun|청구:Cheonggu|신금호:Singeumho|행당:Haengdang|마장:Majang|답십리:Dapsimni|장한평:Janghanpyeong|군자:Gunja|아차산:Achasan|광나루:Gwangnaru',
    '천호:Cheonho|강동:Gangdong|길동:Gil-dong|굽은다리:Gubeundari|명일:Myeongil|고덕:Godeok|상일동:Sangil-dong|강일:Gangil|둔촌동:Dunchon-dong|올림픽공원:Olympic Park|방이:Bangi|개롱:Gaerong|거여:Geoyeo|마천:Macheon',
    '응암:Eungam|역촌:Yeokchon|독바위:Dokbawi|구산:Gusan|새절:Saejeol|증산:Jeungsan|디지털미디어시티:Digital Media City|월드컵경기장:World Cup Stadium|마포구청:Mapo-gu Office|망원:Mangwon|상수:Sangsu|광흥창:Gwangheungchang|대흥:Daeheung|효창공원앞:Hyochang Park',
    '녹사평:Noksapyeong|이태원:Itaewon|한강진:Hangangjin|버티고개:Beotigogae|창신:Changsin|보문:Bomun|안암:Anam|고려대:Korea Univ.|월곡:Wolgok|상월곡:Sangwolgok|돌곶이:Dolgoji|태릉입구:Taereung|화랑대:Hwarangdae|봉화산:Bonghwasan',
    '수락산:Suraksan|마들:Madeul|중계:Junggye|하계:Hagye|공릉:Gongneung|먹골:Meokgol|중화:Junghwa|상봉:Sangbong|면목:Myeonmok|사가정:Sagajeong|용마산:Yongmasan|중곡:Junggok|어린이대공원:Children\'s Grand Park',
    '자양:Jayang|청담:Cheongdam|강남구청:Gangnam-gu Office|학동:Hakdong|논현:Nonhyeon|반포:Banpo|내방:Naebang|남성:Namseong|숭실대입구:Soongsil Univ.|상도:Sangdo|장승배기:Jangseungbaegi|신대방삼거리:Sindaebang-samgeori|보라매:Boramae|신풍:Sinpung|남구로:Namguro',
    '암사:Amsa|강동구청:Gangdong-gu Office|몽촌토성:Mongchontoseong|석촌:Seokchon|송파:Songpa|문정:Munjeong|장지:Jangji|복정:Bokjeong',
    '개화:Gaehwa|공항시장:Gonghang Market|신방화:Sinbanghwa|마곡나루:Magongnaru|양천향교:Yangcheonhyanggyo|가양:Gayang|증미:Jeungmi|등촌:Deungchon|염창:Yeomchang|신목동:Sinmokdong|선유도:Seonyudo',
    '국회의사당:National Assembly|샛강:Saetgang|노들:Nodeul|흑석:Heukseok|구반포:Gubanpo|신반포:Sinbanpo|사평:Sapyeong|신논현:Sinnonhyeon|언주:Eonju|선정릉:Seonjeongneung|삼성중앙:Samseong Jungang|봉은사:Bongeunsa',
    '삼전:Samjeon|석촌고분:Seokchon-gobun|송파나루:Songpanaru|한성백제:Hanseong Baekje|둔촌오륜:Dunchon-oryun|중앙보훈병원:VHS Medical Center',
    '신내:Sinnae|암사역사공원:Amsa History Park',
    '수색:Susaek|가좌:Gajwa|서강대:Sogang Univ.|서빙고:Seobinggo|한남:Hannam|응봉:Eungbong|중랑:Jungnang|망우:Mangu|양원:Yangwon|신촌(경의중앙):Sinchon',
    '서울숲:Seoul Forest|압구정로데오:Apgujeongrodeo|한티:Hanti|구룡:Guryong|개포동:Gaepo-dong|대모산입구:Daemosan|양재시민의숲:Yangjae Citizens\' Forest|청계산입구:Cheonggyesan',
    '북한산우이:Bukhansan Ui|솔밭공원:Solbat Park|4·19민주묘지:4.19 Nat\'l Cemetery|가오리:Gaori|화계:Hwagye|삼양:Samyang|삼양사거리:Samyang Sageori|솔샘:Solsaem|북한산보국문:Bukhansan Bogungmun|정릉:Jeongneung',
    '서울지방병무청:Seoul Regional Military Manpower Admin.|보라매공원:Boramae Park|보라매병원:Boramae Medical Center|당곡:Danggok|서원:Seowon|서울대벤처타운:Seoul Nat\'l Univ. Venture Town|관악산:Gwanaksan',
  ];
  const EN = {};
  EN_RAW.join('|').split('|').forEach((p) => {
    const i = p.indexOf(':');
    EN[p.slice(0, i)] = p.slice(i + 1);
  });

  /* 직접 고른 주변 장소: [종류, 이름, 한 줄 설명, (검색어)] */
  const CURATED = {
    '경복궁': [['명소', '경복궁', '조선 왕조의 정궁'], ['명소', '국립민속박물관', '경복궁 안, 한국인의 생활사'], ['맛집', '토속촌 삼계탕', '서촌의 삼계탕집', '토속촌삼계탕'], ['맛집', '통인시장', '엽전으로 반찬을 고르는 시장']],
    '안국': [['명소', '북촌한옥마을', '한옥 골목 산책'], ['명소', '인사동', '전통 공예와 찻집 거리'], ['명소', '운현궁', '흥선대원군의 사저'], ['맛집', '삼청동수제비', '삼청동 수제비 전문점']],
    '종로3가': [['명소', '종묘', '조선 왕실의 사당, 세계유산'], ['명소', '익선동 한옥거리', '한옥을 고친 카페와 식당'], ['명소', '낙원상가', '악기 상가']],
    '종로5가': [['명소', '광장시장', '1905년 문을 연 시장'], ['맛집', '광장시장 빈대떡', '녹두 빈대떡 골목'], ['맛집', '광장시장 마약김밥', '한 입 크기 김밥'], ['명소', '청계천', '도심을 가로지르는 하천 산책']],
    '종각': [['명소', '보신각', '제야의 종을 치는 곳'], ['명소', '청계광장', '청계천의 시작점'], ['맛집', '종로 피맛골', '골목 안 오래된 식당과 술집']],
    '시청': [['명소', '덕수궁', '돌담길과 근대 건축'], ['명소', '서울도서관', '옛 서울시청사를 쓰는 도서관'], ['명소', '서울광장', '시청 앞 잔디 광장']],
    '서울역': [['명소', '서울로7017', '고가도로를 고친 보행길'], ['명소', '문화역서울284', '옛 서울역사, 전시 공간']],
    '회현': [['명소', '남대문시장', '갈치조림 골목과 칼국수'], ['명소', '한국은행 화폐박물관', '화폐의 역사 전시']],
    '명동': [['명소', '명동성당', '붉은 벽돌 고딕 성당'], ['명소', '남산 케이블카', '남산서울타워로 오르는 케이블카', '남산케이블카'], ['맛집', '명동교자', '칼국수와 만두'], ['맛집', '하동관', '1939년에 시작한 곰탕집']],
    '동대문': [['명소', '흥인지문', '한양 도성의 동쪽 문'], ['맛집', '동대문 닭한마리골목', '닭한마리 칼국수 골목']],
    '동대문역사문화공원': [['명소', '동대문디자인플라자', '곡선으로 지은 건축, DDP', 'DDP 동대문디자인플라자'], ['명소', '한양도성박물관', '서울 성곽의 역사']],
    '동묘앞': [['명소', '동묘', '관우를 모신 사당'], ['명소', '동묘 벼룩시장', '중고 옷과 골동품']],
    '을지로3가': [['맛집', '을지로 노가리골목', '야외 테이블 맥주 골목'], ['명소', '을지로 인쇄골목', '오래된 인쇄소와 공방 골목']],
    '혜화': [['명소', '대학로', '소극장이 모인 거리'], ['명소', '낙산공원', '서울 성곽을 따라 걷는 공원']],
    '신촌': [['명소', '연세대학교', '신촌의 대표 캠퍼스'], ['명소', '신촌 연세로', '차 없는 거리, 버스킹']],
    '이대': [['명소', '이화여대 ECC', '땅속으로 길을 낸 캠퍼스 건축'], ['명소', '이화여대길', '옷과 소품 가게 거리']],
    '합정': [['명소', '절두산 순교성지', '한강변 천주교 순교지'], ['명소', '양화진 외국인선교사묘원', '한강변 묘원']],
    '망원': [['명소', '망원시장', '닭강정과 시장 먹거리'], ['명소', '망원한강공원', '한강변 피크닉']],
    '홍대입구': [['명소', '연남동 경의선숲길', '옛 철길을 공원으로'], ['명소', '홍대 걷고싶은거리', '버스킹과 작은 가게']],
    '공덕': [['맛집', '공덕 족발골목', '족발집이 모인 골목']],
    '여의도': [['명소', '더현대 서울', '실내 정원이 있는 백화점'], ['명소', '여의도 한강공원', '벚꽃과 피크닉'], ['명소', '63스퀘어', '한강변 금빛 빌딩']],
    '여의나루': [['명소', '여의도 한강공원', '자전거와 치맥 피크닉']],
    '국회의사당': [['명소', '국회의사당', '견학할 수 있는 돔 건물']],
    '샛강': [['명소', '여의도샛강생태공원', '도심 속 생태 산책길']],
    '선유도': [['명소', '선유도공원', '옛 정수장을 고친 공원']],
    '노량진': [['명소', '노량진수산시장', '회를 사서 상차림하는 시장']],
    '노들': [['명소', '노들섬', '한강 위 문화 공간']],
    '동작': [['명소', '국립서울현충원', '조용히 걷는 호국 묘역']],
    '고속터미널': [['명소', '반포한강공원', '달빛무지개분수'], ['명소', '고투몰', '지하상가 쇼핑', '고속터미널 고투몰'], ['명소', '서래마을', '프랑스인 거리로 알려진 골목']],
    '신사': [['명소', '가로수길', '카페와 상점이 늘어선 거리', '신사동 가로수길']],
    '압구정': [['명소', '압구정로데오거리', '옷가게와 카페 거리']],
    '선릉': [['명소', '선정릉', '도심 속 조선 왕릉']],
    '삼성': [['명소', '코엑스', '별마당도서관이 있는 몰']],
    '봉은사': [['명소', '봉은사', '강남 한복판 사찰']],
    '잠실': [['명소', '롯데월드타워', '서울스카이 전망대'], ['명소', '석촌호수', '호수 산책로'], ['명소', '롯데월드', '실내외 테마파크']],
    '석촌': [['명소', '석촌호수', '벚꽃 산책길'], ['명소', '송리단길', '카페와 식당 골목']],
    '몽촌토성': [['명소', '몽촌토성', '백제 토성 산책로'], ['명소', '올림픽공원', '88올림픽 기념 공원']],
    '올림픽공원': [['명소', '올림픽공원', '88올림픽 기념 공원'], ['명소', '소마미술관', '공원 안 미술관']],
    '성수': [['명소', '성수동 연무장길', '카페와 공방 골목'], ['명소', '성수동 수제화거리', '수제화 공방 골목']],
    '건대입구': [['명소', '커먼그라운드', '컨테이너로 만든 상점가'], ['맛집', '건대 맛의거리', '술집과 식당 골목']],
    '자양': [['명소', '뚝섬한강공원', '수영장과 피크닉']],
    '어린이대공원': [['명소', '서울어린이대공원', '동물원과 놀이시설']],
    '왕십리': [['맛집', '왕십리 곱창골목', '곱창집 골목']],
    '신림': [['맛집', '신림 순대타운', '백순대 골목']],
    '서울대입구': [['맛집', '샤로수길', '서울대 앞 식당 골목']],
    '낙성대': [['명소', '낙성대공원', '강감찬 장군 탄생지']],
    '남부터미널': [['명소', '예술의전당', '음악당과 미술관']],
    '양재': [['명소', '양재 시민의숲', '매헌 윤봉길 기념관 부근 숲']],
    '도곡': [['명소', '양재천', '벚꽃 산책길']],
    '용산': [['명소', '아이파크몰', '용산의 대형 쇼핑몰']],
    '이촌': [['명소', '국립중앙박물관', '한국 최대 규모 박물관'], ['명소', '용산가족공원', '박물관 옆 공원']],
    '삼각지': [['명소', '전쟁기념관', '전시와 야외 전시장'], ['맛집', '삼각지 대구탕골목', '대구탕 가게 골목']],
    '이태원': [['명소', '이태원 앤틱가구거리', '수입 앤틱 가구 가게'], ['맛집', '이태원 세계음식거리', '여러 나라 음식점']],
    '한강진': [['명소', '리움미술관', '고미술과 현대미술']],
    '월드컵경기장': [['명소', '서울월드컵경기장', '2002 월드컵 경기장'], ['명소', '하늘공원', '억새가 있는 월드컵공원 언덕']],
    '마곡나루': [['명소', '서울식물원', '온실과 호수공원']],
    '개화산': [['명소', '개화산', '한강 하구 전망']],
    '김포공항': [['명소', '롯데몰 김포공항점', '공항과 연결된 쇼핑몰']],
    '양천향교': [['명소', '양천향교', '조선 시대 지방 교육기관']],
    '보라매': [['명소', '보라매공원', '도심 공원']],
    '도봉산': [['명소', '도봉산', '서울 북쪽 등산 명소']],
    '청량리': [['명소', '청량리종합시장', '먹거리 시장']],
    '제기동': [['명소', '경동시장', '약재와 식재료 시장'], ['명소', '서울약령시', '한약재 시장']],
    '고려대': [['명소', '고려대학교', '안암 캠퍼스']],
    '광화문': [['명소', '광화문광장', '세종대왕·이순신 동상'], ['명소', '교보문고 광화문점', '대형 서점'], ['명소', '세종문화회관', '공연장']],
  };

  /* 이름이 바뀐 역: 예전 이름으로 저장된 도장·백업을 새 이름으로 옮길 때 써요 */
  const RENAMED = { '당고개': '불암산', '뚝섬유원지': '자양' };

  window.METRO = { LINES, EN, CURATED, RENAMED, REGION };
})();
