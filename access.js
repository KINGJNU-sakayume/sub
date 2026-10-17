/* 이 역 근처 장소: 가까운 출구와 걸어서 걸리는 시간(어림). tools/place-check.html로 만들어요.
   키는 '역|장소 이름', 값은 [출구 번호(못 찾으면 ''), 도보 분].
   도보 분은 출구에서 장소까지 직선거리 × 1.3 ÷ 분당 70m 로 어림했어요.
   여기 없는 장소는 화면에 이름과 설명만 나와요. */
(function () {
  const ACCESS = {
  };
  window.METRO.ACCESS = ACCESS;
})();
